# Architecture

## Agent Design

The prototype uses a **single Mastra agent** ("Mirzo") with access to all tools. Claude Sonnet 4.5 handles intent classification + tool selection in one pass — no router agent is needed. If routing accuracy proves insufficient in testing, multi-agent decomposition can be revisited in v1.

```
Telegram Bot (telegraf.js)
        ↓
  SCEN-00 check (is ctx.from.id known?)
        ↓
  Per-chat mutex acquired
        ↓
  Eager preload: getUserProfileById + searchKB in parallel
        ↓
  Context assembly
  (system prompt + memory block + KB chunks + history + current message)
        ↓
  Mirzo Agent — selects tools and generates response in one pass
        ↓
  Tool calls — independent calls in parallel, dependent calls sequentially
        ↓
  Response (action markers stripped → inline keyboard rendered)
        ↓
  Session-end memory write (if applicable) → Telegram reply
```

### Available tools

All tools are available every turn. The model decides which to call based on intent.

| Group | Tools |
|---|---|
| **User & profile** | `getUserProfileById`, `getUserProfileByNumber`, `updateUserPreferences` |
| **Billing** | `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods` |
| **Plans** | `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon` |
| **Technical** | `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatus` |
| **Retention** | `getRetentionOffers`, `applyDiscount` |
| **Cross-cutting** | `searchKB`, `escalateToHuman` |

### Tool execution strategy

Tools without data dependencies run in parallel. Tools with dependencies run sequentially.

```
Parallel:    getUserProfileById(userId) + searchKB(query)  — at turn start
Sequential:  getUserProfileById(userId) → getRetentionOffers(userId)
             (profile needed to determine churn risk)
```

At-turn-start, the bot eagerly calls `getUserProfileById` + `searchKB` in parallel and injects both results into context before invoking the agent — guaranteeing profile + KB chunks without a wasted round-trip.

---

## Tool Signatures

All tools are pure TypeScript functions returning mocked data. No external API calls.

```typescript
type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

### User & account

`getUserProfileById(userId: number)` → full mock profile object. Called at start of every turn for known users.

`getUserProfileByNumber(mobileNumber: string)` → full mock profile. Called in SCEN-00 when `ctx.from.id` matches no profile. Input is already normalised to 9-digit form.

`updateUserPreferences(userId: number, prefs: Partial<UserPreferences>)` → updated full preferences object.

### Billing

`getBalance(userId: number)` → `{ balance: number, currency: "TJS", lowBalanceWarning: boolean }`

`getInvoice(userId: number)` →
```typescript
{
  invoiceId: string,       // e.g. "INV-2026-041"
  period: string,          // e.g. "April 2026"
  amount: number,
  currency: "TJS",
  status: 'paid' | 'overdue' | 'pending',
  dueDate: string,         // ISO 8601
  lineItems: { description: string, amount: number }[]
}
```

`applyCredit(userId: number, amount: number)` → `{ newBalance: number, currency: "TJS" }`

`getPaymentMethods()` → list of payment methods in Tajikistan (Alifmobi, Esxata Mobile, DC Pay, USSD *100#)

### Plans

`listPlans()` → array of plan objects: `{ id, name, dataGB, callMinutes, price }`

`comparePlans(planIdA: string, planIdB: string)` → side-by-side diff object (data, minutes, price delta)

`changePlan(userId: number, planId: string)` → `{ confirmation: string, effectiveDate: string }` — effective date is always first of next month

`getDataAddons()` → array of `{ id, dataGB, price }`

`purchaseAddon(userId: number, addonId: string)` → `{ confirmation: string, newDataBalanceGB: number, newBalanceSomoni: number }`

### Technical

`checkOutage(region: string)` →
```typescript
{
  region: string,
  status: 'active' | 'clear',
  affectedAreas?: string[],
  estimatedResolution?: string,   // ISO 8601, only when status is 'active'
  incidentId?: string
}
```

`runDiagnostic(userId: number)` → `{ signalStrength: 'good' | 'weak' | 'none', dataActive: boolean, simStatus: 'ok' | 'error', recommendation: string }`

`createTicket(userId: number, issue: string)` → `{ ticketId: string, estimatedResolutionHours: number, message: string }`

`getTicketStatus(ticketId: string)` → `{ ticketId: string, status: 'open' | 'in_progress' | 'resolved', lastUpdate: string }`

### Retention

`getRetentionOffers(userId: number)` → personalised offers based on churn risk + current plan:
```typescript
[
  { offerId: "RET-20PCT-3M", description: "20% discount for 3 months", savingSomoni: 24 },
  { offerId: "RET-FREE-DATA", description: "1 free month of extra 10GB", savingSomoni: 55 }
]
```

`applyDiscount(userId: number, offerId: string)` → `{ confirmation: string, newMonthlyFee: number, validUntil: string }`

`escalateToHuman(userId: number, reason: string)` → `{ confirmation: string, referenceId: string, message: string }`

### Knowledge base

`searchKB(query: string)` → top-3 matching chunks (topK fixed at 3 internally):
```typescript
[{ chunkId: string, group: string, score: number, question: string, answer: string }]
```

---

## Knowledge Base & RAG

### RAG pipeline

```
User message (any language)
     ↓
searchKB(query)
     ↓
TF-IDF cosine similarity over pre-computed multilingual chunk vectors (built at startup)
     ↓
Top-3 chunks injected into context (chunks with score < 0.05 are dropped as noise)
     ↓
Agent decides:
  — KB alone sufficient  (general/policy questions)
  — KB + tool call       (account-specific questions)
  — no match             → escalateToHuman()
```

### Retrieval implementation

At startup, `retriever.ts` builds TF-IDF vectors from each chunk's `keywordTags` array (multilingual — Tajik, Russian, Uzbek, English terms). Vectors stored as `{ chunkId, vector }[]`. Cosine similarity computed at query time across all 23 vectors — at this scale no index is needed.

If retrieval quality is insufficient for Uzbek/English queries, upgrade `retriever.ts` to multilingual embeddings (`multilingual-e5-large`).

---

## State Management

SCEN-04 requires a deterministic multi-step flow. A state machine is stored in short-term memory per session.

```typescript
type CancellationState =
  | 'INIT'
  | 'REASON_ASKED'
  | 'OFFER_PRESENTED'
  | 'OFFER_DECLINED'
  | 'ALTERNATIVE_PRESENTED'
  | 'ESCALATED'

// stored in short-term memory
shortTermMemory.cancellationState: CancellationState
```

State transitions:
```
INIT               → agent asks for cancellation reason
REASON_ASKED       → getRetentionOffers(), present best offer
OFFER_PRESENTED    → accepted → applyDiscount(), resolve
                   → declined → OFFER_DECLINED
OFFER_DECLINED     → comparePlans(), present alternative
ALTERNATIVE_PRESENTED → accepted → changePlan(), resolve
                      → declined → ESCALATED
ESCALATED          → escalateToHuman(), session ends
```

Never skip a step. Never loop back unless the user explicitly restarts. Never re-offer a discount already in `longTermMemory.offersShown`.

---

## Memory

### Short-term (within session)
Managed by Mastra's thread context. Stores message history + `cancellationState`. Resets on `/start`. No inactivity timeout for the prototype.

### Long-term (across sessions, within process)
`Map<userId, LongTermMemory>` — in-process only, not persisted to disk.

```typescript
{
  userId: number,
  lastInteractionDate: string,           // ISO 8601
  totalInteractions: number,
  offersShown: string[],                 // retention offer IDs already presented
  previousPlans: string[],
  resolvedIssues: string[],              // issue types from createTicket calls
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[],
  summary: string,                       // 1-2 sentence agent-written recap of last session
}
```

**Write policy:** Written once at session end only. The agent generates a `summary`; the bot updates structural fields. All other turns are read-only.

**Session ends when:**
- `escalateToHuman()` is called
- Cancellation state machine reaches `ESCALATED` or resolves cleanly
- User sends `/start` or `/end`

### Memory injection into context

```
[Memory]
Last interaction: 3 days ago — resolved: internet outage in Dushanbe.
Offers already shown: 20% discount (declined).
User's preferred language: Russian. Style: casual, short responses.
Current plan: Connect (50 GB). Balance: 12 TJS (low).
```

---

## Context Management

| Layer | Contents | Max tokens |
|---|---|---|
| System prompt | Role, rules, language instructions | ~500 |
| Memory block | Summarised history + preferences | ~300 |
| KB chunks | Top-3 retrieved chunks | ~600 |
| Conversation history | Last 10 message pairs (sliding window) | ~1500 |
| Current user message | | ~200 |
| **Total** | | **~3100** |

Context is assembled in this exact order every turn. Older messages beyond 10 pairs are dropped — critical facts from prior turns should already be in long-term memory or the current tool result.

---

## Error Handling

- On any `{ success: false }` tool result: polite apology in user's language + `escalateToHuman(userId, error)`. Never surface raw error strings.
- Anthropic API 10-second timeout: reply "I'm having trouble right now, please try again." Keep session active. Do not escalate.
- `ctx.reply()` failure: log to console, do not retry. User can re-send.
