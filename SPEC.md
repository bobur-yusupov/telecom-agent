# Telecom Support AI Agent

A conversational agent that handles real customer requests in Uzbek, Tajik, English and Russian — via Telegram — covering billing, plan changes, technical issues, and cancellations.

## Tech Stack

| **Component** | **Technology** |
|:---|:---|
| AI Framework | Mastra (TypeScript) |
| Channel | Telegram Bot |
| Data layer | In-memory JS objects (no database) |
| Model | Claude Sonnet 4.5 (`claude-sonnet-4-5`) |
| RAG | Cross-lingual query translation + TF-IDF cosine search over KB chunks (in-memory) |
| Memory | Mastra Memory — short-term (thread) + long-term (in-memory Map) |
| Interface languages | Uzbek, Tajik, English, Russian |

## Model Configuration
The model is configurable via environment variables — no code change required to swap providers:
```
# .env
TELEGRAM_TOKEN=...
ANTHROPIC_API_KEY=...
MODEL_NAME=claude-sonnet-4-5    # swap to any supported model
LOG_LEVEL=info                  # debug | info | warn | error
```

Initializing model in Mastra:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
const model = anthropic(process.env.MODEL_NAME)
```

## Functional Requirements

### Scenarios

**SCEN-00 - User Onboarding (first-time user)**
1. User sends any message or `/start` command.
2. Bot checks: does `ctx.from.id` match any mock profile?
3. If YES → load profile, proceed normally.
4. If NO → bot replies with the multilingual greeting (one combined message containing all four languages, since user language is not yet known):
   > 🇹🇯 Хуш омадед ба NovaTel! Шумораи мобилии худро ворид кунед.
   > 🇷🇺 Добро пожаловать в NovaTel! Введите ваш мобильный номер.
   > 🇺🇿 NovaTel'ga xush kelibsiz! Mobil raqamingizni kiriting.
   > 🇬🇧 Welcome to NovaTel! Please enter your mobile number.
5. User replies with their number. Bot normalises the input to a canonical 9-digit form:
   - Accept: `987654321`, `+992987654321`, `992987654321`, `0987654321`
   - Strip non-digits, strip leading country code `992`, strip leading `0`. If the result is not exactly 9 digits, treat as an invalid attempt (count toward the 3-attempt limit) and reply in all four languages asking for a valid number.
6. Bot calls `getUserProfileByNumber(normalisedNumber)`.
7. If found → link `telegramId` to profile, set user language from profile, send confirmation in that language, proceed normally.
8. If not found → reply in all four languages: "Number not found. Please check and try again."
9. After 3 failed attempts (invalid format or not found, combined) → call `escalateToHuman()`.

**SCEN-01 — Billing & payments**
User can ask about their balance, last invoice, and next payment date. Agent calls `getInvoice()` and returns itemised data from the user's mock profile. One write action: mark invoice as viewed.

**SCEN-02 — Plan change**
User can browse available plans and switch to a different one. Agent calls `listPlans()`, `comparePlans()`, explains the difference, and confirms the change via `changePlan()`. Change takes effect "from next month" (mocked).

**SCEN-03 — Technical support**
User reports a connectivity or internet issue. Agent calls `checkOutage(user.region)` and `runDiagnostic(userId)`, provides basic troubleshooting steps. If unresolved, calls `createTicket()` and returns a ticket number to the user.

**SCEN-04 — Cancellation & retention**
User says they want to cancel. Agent follows a defined state machine (see State Management section). Asks for reason → offers discount → if declined offers alternative plan → if still declined calls `escalateToHuman()`. Agent never skips steps.

## Multilingual support

The agent MUST respond in the same language as the user's last message: Uzbek, Tajik, English, or Russian. If the user switches languages mid-conversation, the agent adapts immediately.

Tajik, Russian, and Uzbek all use Cyrillic script. English uses Latin script.

**Cross-lingual retrieval:** KB chunks are authored in Tajik + Russian, but `keywordTags` on each chunk are multilingual (Tajik, Russian, English, Uzbek). TF-IDF cosine similarity runs over those multilingual tags, so retrieval works regardless of the user's input language — no pre-translation step is required. The response is generated in the user's original language directly from the retrieved Tajik/Russian chunks. If recall is poor in production testing, switch `retriever.ts` to multilingual embeddings (`multilingual-e5-large`).

**Uzbek/Tajik disambiguation:** Both languages use Cyrillic. Disambiguation relies on vocabulary patterns — the model is instructed to treat ambiguous inputs as Russian and ask for clarification if needed.

## User Identification

Users are identified by `ctx.from.id` from Telegram. This ID maps to a mock profile in `users.ts`. If no match is found, **SCEN-00** (onboarding) is triggered. No login, OTP, or authentication flow is required.

## Mock Data

### Users — 8 personas

8 profiles are defined in `src/data/users.ts`. The set is sized to cover every acceptance criterion without bloat. Each persona is chosen to exercise a specific axis of the system:

| # | Persona | Language | Region | Plan | Churn risk | Key signals |
|---|---|---|---|---|---|---|
| 1 | Tech-savvy student | Russian | Dushanbe | Connect | low | balance OK, no open tickets |
| 2 | Elderly, low literacy | Tajik | Khujand | Starter | medium | needs short replies, casual tone |
| 3 | Businessman | English | Dushanbe | Unlimited Pro | low | high spend, formal tone |
| 4 | Rural resident | Tajik | Kulob | Starter | low | weak 3G coverage area, prior outage |
| 5 | Frustrated customer | Russian | Dushanbe | Connect | high | overdue balance, declined offer history |
| 6 | Uzbek migrant worker | Uzbek | Bokhtar | Connect | medium | roaming history, family back home |
| 7 | Low-balance student | Tajik | Istaravshan | Starter | medium | balance below threshold, topup reminder on |
| 8 | New user (no profile) | — | — | — | — | triggers SCEN-00 onboarding |

Each profile will contain:
```typescript
{
  id: number,
  telegramId: number,
  name: string,
  persona: string,                          // e.g. 'student', 'businessman', 'elderly'
  age: number,
  language: 'uz' | 'tj' | 'ru' | 'en',
  region: string,                           // e.g. 'Dushanbe', 'Khujand', 'Kulob'
  plan: string,                             // plan ID
  monthlyFee: number,                       // Somoni
  dataUsedGB: number,
  dataLimitGB: number,
  balance: number,                          // Somoni
  nextBillDate: string,                     // ISO 8601
  lastInvoiceAmount: number,
  paymentStatus: 'paid' | 'overdue' | 'pending',
  churnRisk: 'low' | 'medium' | 'high',
  openTickets: number,
  deviceType: string,                       // e.g. 'Android budget', 'iPhone', 'feature phone'
  preferences: UserPreferences,
  interactionHistory: InteractionRecord[],
}
```
Persona definition and full data population is deferred to the data specification phase.

`InteractionRecord` schema
```typescript
{
  date: string,                             // ISO 8601
  scenario: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention',
  resolved: boolean,
  resolutionType: 'self-served' | 'escalated' | 'abandoned',
  ticketId?: string,
  planChanged?: string,                     // new plan ID if applicable
  discountApplied?: string,                 // offer ID if applicable
}
```

### Service catalog

```
Mobile plans:
  Starter        — 10GB, 50 minutes to other operators, unlimited calls inside NovaTel,  45 Somoni/mo
  Connect        — 50GB, 100 minutes to other operators, unlimited calls inside NovaTel,  80 Somoni/mo
  Unlimited Pro  — unlimited, 100 minutes to other operators, unlimited calls inside NovaTel, 120 Somoni/mo

Call Packages:
  NovaTel internal  — unlimited calls for 5 Somoni/mo
  To other operators — 100 minutes for 10 Somoni/mo
  To other operators — 300 minutes for 20 Somoni/mo
  International - 3 min/1 TJS

Add-ons:
  Extra data 1GB  — 8 Somoni
  Extra data 3GB  — 20 Somoni
  Extra data 10GB — 55 Somoni

```

## Agent Architecture

The prototype uses a **single Mastra agent** ("Mirzo") with access to all tools. Claude Sonnet 4.5 is capable of intent classification + tool selection in one pass, so a router agent is not used. If routing accuracy proves insufficient in testing, multi-agent decomposition can be revisited in v1.

```
Telegram Bot (telegraf.js)
        ↓
  SCEN-00 check (is ctx.from.id known?)
        ↓
  Per-chat mutex acquired (drop concurrent messages from same chat)
        ↓
  Context assembly
  (system prompt + memory block + KB chunks + history + current message)
        ↓
  Mirzo Agent — selects tools and generates response in one pass
        ↓
  Tool calls — Mastra runs independent calls in parallel,
               dependent calls sequentially
        ↓
  Response generation
        ↓
  Memory update (end-of-session summary write to long-term store)
        ↓
  Telegram reply (with optional inline keyboard)
```

### Available tools

All tools below are available to the agent on every turn. The model decides which to call based on the user's intent. Tools are grouped here for documentation only:

| Group | Tools |
| --- | --- |
| **User & profile** | `getUserProfileById`, `getUserProfileByNumber`, `updateUserPreferences` |
| **Billing** | `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods` |
| **Plans** | `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon` |
| **Technical** | `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatus` |
| **Retention** | `getRetentionOffers`, `applyDiscount` |
| **Cross-cutting** | `searchKB`, `escalateToHuman` |

### Tool execution strategy
Tools that do not depend on each other's output are called in parallel by Mastra. Tools with data dependencies are called sequentially.

```
Parallel example:
  `getUserProfileById(userId)` + `searchKB(query)` → run together at turn start

Sequential example:
  `getUserProfileById(userId)` → `getRetentionOffers(userId)`
  (profile needed to determine churn risk before fetching offers)
```

### At-turn-start preload
On every turn for a known user, the bot eagerly calls `getUserProfileById(userId)` and `searchKB(userMessage)` in parallel *before* invoking the agent, and injects both results into the context. This guarantees the agent always has profile + relevant KB chunks without a wasted routing round-trip.

## Tools
All tools are pure TypeScript functions returning mocked data. No external API calls. All tools return a typed result envelope:
```typescript
type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

### User & account tools

`getUserProfileByNumber(mobileNumber: string)`
- Input: string, e.g. "987654321"
- Output: full mock profile object
- When to call: triggered by SCEN-00 when ctx.from.id matches no profile

`getUserProfileById(userId: number)`
- Input: number, user ID
- Output: full mock profile object
- When to call: at the start of every turn for known users

`getInvoice(userId: number)`
- Input: number, user ID
- Output: 
```typescript
{
  invoiceId: string,       // e.g. "INV-2026-041"
  period: string,          // e.g. "April 2026"
  amount: number,          // Somoni
  currency: "TJS",
  status: 'paid' | 'overdue' | 'pending',
  dueDate: string,         // ISO 8601
  lineItems: { description: string, amount: number }[]
}
```

`updateUserPreferences(userId: number, prefs: Partial<UserPreferences>)`
- Input: user ID + partial preferences object
- Output: updated full preferences object

### Plan & catalog tools

`listPlans()`
- Input: none
- Output: array of all plan objects with ID, name, dataGB, callMinutes, price

`comparePlans(planIdA: string, planIdB: string)`
- Input: two plan IDs
- Output: side-by-side diff object highlighting data, minutes, price delta

`changePlan(userId: number, planId: string)`
- Input: user ID + plan ID
- Output: { confirmation: string, effectiveDate: string } — effective date is always first of next month

`getDataAddons()`
- Input: none
- Output: array of all data add-on packages with ID, dataGB, price

`purchaseAddon(userId: number, addonId: string)`
- Input: user ID + add-on ID
- Output: { confirmation: string, newDataBalanceGB: number, newBalanceSomoni: number }

### Technical support tools

`checkOutage(region: string)`
- Input: region name, e.g. "Dushanbe"
- Output:
```typescript
{
  region: string,
  status: 'active' | 'clear',
  affectedAreas?: string[],
  estimatedResolution?: string,   // ISO 8601, present only if status is 'active'
  incidentId?: string
}
```

`runDiagnostic(userId: number)`
- Input: user ID
- Output: { signalStrength: 'good' | 'weak' | 'none', dataActive: boolean, simStatus: 'ok' | 'error', recommendation: string }

`createTicket(userId: number, issue: string)`
- Input: user ID + issue description string
- Output: { ticketId: string, estimatedResolutionHours: number, message: string }

`getTicketStatus(ticketId: string)`
- Input: ticket ID string
- Output: { ticketId: string, status: 'open' | 'in_progress' | 'resolved', lastUpdate: string }

### Billing tools

`getBalance(userId: number)`
- Input: user ID
- Output: { balance: number, currency: "TJS", lowBalanceWarning: boolean }

`applyCredit(userId: number, amount: number)`
- Input: user ID + credit amount in Somoni
- Output: { newBalance: number, currency: "TJS" }

`getPaymentMethods()`
- Input: none
- Output: list of available payment methods in Tajikistan, e.g. Alifmobi, Esxata Mobile, DC Pay, USSD *100#

### Retention tools

`getRetentionOffers(userId: number)`
- Input: user ID
- Output: array of personalised offers based on churn risk + current plan
```typescript
[
  { offerId: "RET-20PCT-3M", description: "20% discount for 3 months", savingSomoni: 24 },
  { offerId: "RET-FREE-DATA", description: "1 free month of extra 10GB", savingSomoni: 55 }
]
```

`applyDiscount(userId: number, offerId: string)`
- Input: user ID + offer ID
- Output: { confirmation: string, newMonthlyFee: number, validUntil: string }

`escalateToHuman(userId: number, reason: string)`
- Input: user ID + reason string
- Output: { confirmation: string, referenceId: string, message: string }

### Knowledge base tool

`searchKB(query: string)`
- Input: natural language query in any supported language
- Output: top-3 matching KB chunks with relevance score (topK is fixed at 3 internally)
```typescript
[{ chunkId: string, group: string, score: number, question: string, answer: string }]
```

------------------------------------

## Knowledge Base & RAG

### Structure
The KB consists of 24 pre-defined chunks across 6 topic groups (see `FAQs.md`):

| Group | Chunk IDs | Count | Type |
| --- | --- | --- | --- |
| Billing & payments | BIL-001..004 | 4 | FAQ + KB |
| Top-up & balance | TOP-001..004 | 4 | FAQ + KB |
| Plans & upgrades | PLN-001..004 | 4 | FAQ + KB |
| Technical support | TEC-001..005 | 5 | FAQ + KB |
| Roaming & international | ROA-001..003 | 3 | FAQ + KB |
| Cancellation & retention | RET-001..003 | 3 | FAQ + KB |
| **Total** | | **23** | |

Each chunk contains: `chunkId`, `group`, `question` (Tajik + Russian), `answer` (Tajik + Russian), `type` ('FAQ' or 'KB'), `toolTags` (which tools may be relevant to follow up with), `keywordTags` (multilingual — Tajik + Russian + English + Uzbek terms, used by TF-IDF).

English and Uzbek responses are generated by the model from the Tajik/Russian chunk content at inference time — chunks are not duplicated in those languages.

### RAG pipeline
```
User message (any language)
     ↓
searchKB(query)
     ↓
TF-IDF cosine similarity over pre-computed multilingual chunk vectors (built at startup)
     ↓
Top-3 chunks injected into agent context (drop any with score < 0.05 as noise)
     ↓
Agent decides:
  — answer from KB alone (general/policy questions)
  — KB + tool call combined (user-specific questions)
  — no relevant chunks + no applicable tool → escalateToHuman()
```

### Retrieval implementation (prototype)
On bot startup, `retriever.ts` builds TF-IDF vectors from each chunk's `keywordTags` array (which contains terms in all four supported languages). This runs once synchronously before the bot accepts messages. Vectors are stored as a plain array of `{ chunkId, vector }` objects. Cosine similarity is computed at query time across all 23 vectors — at this scale no indexing is needed.

If retrieval quality proves insufficient for Uzbek or English queries, the next iteration will replace TF-IDF with multilingual embeddings (e.g. `multilingual-e5-large`).

## State Management
SCEN-04 (cancellation/retention) requires a deterministic multi-step flow. A simple state machine is stored in short-term memory per session to prevent the agent from skipping steps, looping, or forgetting what it already offered.
```typescript
type CancellationState =
  | 'INIT'
  | 'REASON_ASKED'
  | 'OFFER_PRESENTED'
  | 'OFFER_DECLINED'
  | 'ALTERNATIVE_PRESENTED'
  | 'ESCALATED'

// Stored in short-term memory
shortTermMemory.cancellationState: CancellationState
```

State transitions:
```
INIT
  → agent asks for cancellation reason
REASON_ASKED
  → agent calls getRetentionOffers(), presents best offer
OFFER_PRESENTED
  → if accepted → applyDiscount(), resolve
  → if declined → OFFER_DECLINED
OFFER_DECLINED
  → agent presents alternative plan via comparePlans()
ALTERNATIVE_PRESENTED
  → if accepted → changePlan(), resolve
  → if declined → ESCALATED
ESCALATED
  → escalateToHuman(), session ends cleanly
```

## User Preferences
Each user profile includes a preferences object that persists across sessions and influences agent behaviour.

### Preference schema
```typescript
preferences: {
  language: 'uz' | 'tj' | 'ru' | 'en',    // preferred response language
  responseLength: 'short' | 'detailed',     // brevity preference
  communicationStyle: 'formal' | 'casual',
  topupReminderEnabled: boolean,             // proactively warn on low balance
  lowBalanceThreshold: number,              // Somoni — triggers low balance warning
  preferredPaymentMethod: string | null,    // e.g. 'Alifmobi', 'Esxata Mobile', 'DC'
  lastKnownIssue: string | null,            // last reported technical issue type
}
```

### Preference usage
The agent reads preferences at the start of every conversation and adjusts language, tone, and response length accordingly. If `topupReminderEnabled` is true and `balance` < `lowBalanceThreshold`, the agent proactively mentions the low balance at the start of the conversation. Preferences can be updated mid-conversation via `updateUserPreferences()` if the user explicitly requests a change (e.g. "please be more brief").

## Memory

### Short-term memory (within session)
Managed by Mastra's built-in thread context. Stores the full message history of the current Telegram conversation, plus any active state machine state (e.g. `cancellationState`).
Resets on explicit `/start` command. No inactivity timeout — for the prototype, session continuity is preserved regardless of gap between messages. (Inactivity timeout is a production concern.)
Used for: conversational coherence, avoiding repeated questions, tracking offers already made in the current session.

### Long-term memory (across sessions, within process)
Persisted in a `Map<userId, LongTermMemory>`. Survives across Telegram conversations within a single process run. Not persisted to disk for the prototype.

```typescript
longTermMemory: {
  userId: number,
  lastInteractionDate: string,           // ISO 8601
  totalInteractions: number,
  offersShown: string[],                 // retention offer IDs already presented
  previousPlans: string[],               // plans the user has been on
  resolvedIssues: string[],              // issue types from createTicket calls
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[],
  summary: string,                       // 1-2 sentence agent-written recap of last session
}
```

### Write policy
For the prototype, long-term memory is written **once at session end** (see "Session end" definition below). The agent generates a 1–2 sentence `summary` of what happened, and the bot updates structural fields (`totalInteractions`, `lastInteractionDate`, plus any of `offersShown` / `previousPlans` / `resolvedIssues` / `satisfactionSignals` touched during the session). Within a session, long-term memory is read-only — all in-session continuity comes from short-term memory.

### Session end definition
A session ends when any of the following happen:
- `escalateToHuman()` is called.
- The cancellation state machine reaches `ESCALATED`, or a discount / plan change resolves it.
- The user sends `/start` (force new session).
- The user sends `/end` (explicit end).

No inactivity timeout in the prototype.

### Memory injection into context
At the start of each turn, a summarised memory block is injected into the agent context:

```
[Memory]
Last interaction: 3 days ago — resolved: internet outage in Dushanbe.
Offers already shown: 20% discount (declined).
User's preferred language: Russian. Style: casual, short responses.
Current plan: Connect (50GB). Balance: 12 Somoni (low).
```

## Context Management

### Context window strategy
The agent operates within a bounded context window. To avoid overflow in long conversations, the following strategy is applied:

|Layer|What it contains|Max tokens (approx)|
|---|---|---|
|System prompt|Role, rules, language instructions|~500|
|Memory block|Summarised user history + preferences|~300|
|Top-3 retrieved chunks|Top-3 retrieved chunks|~600|
|Conversation history|Last 10 message pairs (sliding window)|~1500|
|Current user message|Current user message|~200|
|Total|**Total tokens**|**~3100**|

### Sliding window
Conversation history is trimmed to the last 10 message pairs. Older messages are dropped. Critical facts from older messages should already be captured in long-term memory or the current tool call result.

### Context assembly order
Every turn, the agent context is assembled in this exact order:

```
1. System prompt (role + rules + language instruction)
2. Memory block (user preferences + long-term summary)
3. Retrieved KB chunks (from searchKB, if relevant)
4. Sliding window conversation history (last 10 pairs)
5. Current user message
```

### Tool result handling
Tool results are injected as assistant-side context immediately after the tool call, before the agent generates its response. They are not written to long-term memory unless the event matches a write trigger defined above.

-------------

## Error Handling

### Tool error envelope
All tools return a typed result envelope:
```
type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

### Agent behaviour on failure
- The agent must never surface raw error strings to the user.
- On any success: false result, the agent responds with a polite apology in the user's language and automatically calls escalateToHuman(userId, error).
- The raw error is logged to console.error for debugging.

### Model/API timeout
Anthropic API calls are wrapped in a 10-second timeout. On timeout the bot sends: "I'm having trouble right now. Please try again in a moment." No escalation is triggered for transient timeouts — the session remains active.

### Telegram delivery failure
If `ctx.reply()` throws, log the error to console and do not retry. The user can re-send their message.

-------------

## Telegram UX

### Inline keyboards
Binary decisions use Telegram inline keyboards instead of waiting for typed responses. This improves demo quality and reduces input errors, especially for elderly or less literate users.

```typescript
// Example: plan change confirmation
ctx.reply('Switch to Unlimited Pro (120 Somoni/mo)?', {
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Yes, switch', callback_data: 'confirm_plan_unlimited_pro' },
      { text: '❌ No, keep current', callback_data: 'cancel_plan_change' }
    ]]
  }
})
```
Use inline keyboards for: plan change confirmation, discount offer accept/decline, ticket creation confirmation, cancellation confirmation.

### Typing indicator
Send a typing indicator before any response that involves an LLM call or tool call:
```typescript
ctx.sendChatAction('typing');
// then call agent
```

### Message length limit

Telegram caps messages at 4096 characters. Responses exceeding 3800 characters must be split into multiple messages at paragraph boundaries:
```typescript
function splitMessage(text: string, limit = 3800): string[] {
  // split on double newlines to avoid mid-sentence cuts
  const paragraphs = text.split('\n\n')
  // group into chunks under limit
}
```

## System Prompt Requirements

| **Role** | "You are Mirzo - a customer support AI agent for NovaTel, a telecom company in Tajikistan." |
| **Language rule** | Respond in the exact language the user writes in. Never mix languages within a reply. Tajik, Russian, and Uzbek use Cyrillic script. |
| **Data integrity** | Never invent numbers, plan names, or prices. Always call the appropriate tool to retrieve user-specific information. |
| **KB usage** | Before answering any general question, search the KB via `searchKB()`. |
| **Fallback** | If KB and tools both fail to resolve the query, call `escalateToHuman()`. Never leave a dead end. |
| **Tone** | Match `userPreferences.communicationStyle`. Default: polite, concise, conversational. |
| **Memory awareness** | Use the injected memory block to personalise responses. Never re-offer a discount already declined. |
| **State** | For SCEN-04, always check cancellationState before deciding the next action. |
| **Identity** | Never claim to be ChatGPT, GPT, or any other AI system. |

### System prompt draft (v0)
```
You are Mirzo, a customer support AI agent for NovaTel — a mobile telecom operator in Tajikistan.

LANGUAGE
- Detect the user's language from their most recent message (Tajik, Russian, Uzbek, or English).
- Respond in exactly that language. Never mix two languages in one reply.
- Tajik, Russian, and Uzbek all use Cyrillic. If a Cyrillic message is ambiguous between Tajik and Uzbek, treat as Russian and politely ask which language the user prefers.

DATA INTEGRITY
- Never invent numbers, plan names, prices, ticket IDs, or dates. Always retrieve them via tools.
- If you do not have a tool result or KB chunk that supports a claim, do not make the claim — ask a clarifying question or call escalateToHuman.

KB AND TOOLS
- Top-3 KB chunks are pre-loaded in the [KB] block below. Read them before deciding whether to answer or call a tool.
- For account-specific questions (balance, invoice, ticket status, plan change), call the appropriate tool.
- For policy / how-things-work questions, the KB block is usually sufficient.
- Tools that don't depend on each other should be called together.

MEMORY
- Read the [Memory] block before responding. Never re-offer a discount the user has already declined (check offersShown).
- Adapt tone and length to userPreferences.communicationStyle and userPreferences.responseLength.

CANCELLATION FLOW (SCEN-04)
- The current cancellationState is in the [Session] block. Follow it strictly:
  INIT → ask for reason
  REASON_ASKED → call getRetentionOffers, present best offer
  OFFER_PRESENTED → if accepted, call applyDiscount; if declined, transition to OFFER_DECLINED
  OFFER_DECLINED → present alternative plan via comparePlans
  ALTERNATIVE_PRESENTED → if accepted, call changePlan; if declined, call escalateToHuman
- Never skip a step. Never loop back unless the user explicitly restarts.

BINARY DECISIONS
- For confirmations (plan change, discount accept/decline, ticket creation, cancellation), end your reply with a marker line:
  [ACTION: confirm_plan_<planId>]
  [ACTION: accept_offer_<offerId> | decline_offer_<offerId>]
  [ACTION: create_ticket | skip_ticket]
- The bot renders these as inline keyboard buttons; do not write them into the user-visible text.

ERROR HANDLING
- If a tool returns { success: false }, apologise in the user's language and call escalateToHuman with the error reason. Never surface raw error strings.

IDENTITY
- You are Mirzo. Never claim to be ChatGPT, Claude, GPT, or any other system.
```

## Inline keyboards and callback re-entry

Inline keyboards are the bot's way of capturing binary or small-N decisions. The agent does not see button taps as ordinary chat messages — they arrive as `callback_query` events.

### Action markers
The agent emits action markers at the end of a reply, e.g. `[ACTION: confirm_plan_unlimited_pro]`. A post-processor strips these markers from the user-visible text and renders them as inline keyboard buttons.

### Callback handling
When the user taps a button, the bot:
1. Receives a `callback_query` with `callback_data` (e.g. `confirm_plan_unlimited_pro`).
2. Calls `ctx.answerCbQuery()` to dismiss the loading spinner.
3. Edits the original message to disable the buttons (prevent double-taps).
4. Injects a synthetic user message into the agent context: `"[User selected: confirm_plan_unlimited_pro]"` (in English regardless of conversation language — it is metadata, not user content).
5. Re-runs the agent turn with this synthetic message.

This keeps the agent loop uniform: every turn starts with a user message, whether typed or tapped.

### When to emit action markers
- Plan change confirmation
- Retention discount accept/decline
- Ticket creation confirmation
- Cancellation confirmation
- Anywhere the alternative is "user types yes/no" — never do that, use a button.

## Concurrency

Telegraf delivers messages sequentially per chat, but the agent loop is async, so two messages arriving within the same turn could interleave. To prevent this:

- A simple `Map<chatId, Promise<void>>` mutex per chat. New messages await the previous turn's promise before starting.
- If a message arrives while a turn is in flight, the bot sends a typing indicator and queues the message — it is processed when the previous turn completes.
- Per-chat queue depth is capped at 3; messages beyond that are dropped with a "please wait a moment" reply.

## Logging

All logs use a structured JSON envelope written to stdout. `LOG_LEVEL` env var controls verbosity.

```typescript
{
  ts: string,                  // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,               // 'turn.start', 'turn.end', 'tool.call', 'tool.error', 'kb.retrieve', 'agent.escalate'
  chatId: number,
  userId?: number,
  scenario?: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention',
  toolName?: string,
  durationMs?: number,
  error?: { message: string, stack?: string },
}
```

Required log events:
- `turn.start` / `turn.end` with `durationMs` (SC-05 measurement)
- `tool.call` / `tool.error` for every tool invocation
- `kb.retrieve` with the query, top-3 chunk IDs, and scores
- `agent.escalate` whenever `escalateToHuman` fires

## File / module layout

```
src/
  bot/
    telegram.ts        # telegraf bootstrap, message handler, callback_query handler, mutex
    callbacks.ts       # action marker parser, inline keyboard renderer
  agents/
    mirzo.ts           # the single Mastra agent definition + system prompt
    cancellation.ts    # state machine helpers (transitions, predicates)
  tools/
    user.ts            # getUserProfileById, getUserProfileByNumber, updateUserPreferences
    billing.ts         # getBalance, getInvoice, applyCredit, getPaymentMethods
    plans.ts           # listPlans, comparePlans, changePlan, getDataAddons, purchaseAddon
    technical.ts       # checkOutage, runDiagnostic, createTicket, getTicketStatus
    retention.ts       # getRetentionOffers, applyDiscount
    common.ts          # searchKB, escalateToHuman, ToolResult envelope
  kb/
    chunks.ts          # the 23 KB chunks (Tajik + Russian content, multilingual keyword tags)
    retriever.ts       # TF-IDF vectorisation at startup, cosine similarity at query time
  memory/
    shortTerm.ts       # Mastra thread wrapper + cancellationState
    longTerm.ts        # Map<userId, LongTermMemory>, read/write helpers
  data/
    users.ts           # 8 mock personas
    plans.ts           # plan + addon catalog
    outages.ts         # mock outage data per region
  context/
    assemble.ts        # builds the system prompt + memory block + KB block + history payload
  utils/
    logger.ts          # structured JSON logger
    phone.ts           # normaliseMobileNumber
  index.ts             # entry point — boot retriever, then start bot
```


## Acceptance Criteria

| ID | Criterion | Linked scenario | How to verify |
|---|---|---|---|
| SC-01 | All 4 scenarios complete without errors | SCEN-01..04 | Manual run of each scenario in Telegram |
| SC-02 | Response language matches user's language | All | Send messages in Tajik, Russian, Uzbek, English — verify response language |
| SC-03 | Agent never invents data | All | All figures must match mock profile values exactly |
| SC-04 | No conversation reaches a dead end | All | Every path ends with resolution or escalateToHuman() |
| SC-05 | p95 response latency under 5 seconds | All | Measure from `ctx.message` arrival to first `ctx.reply` resolution, excluding typing-indicator delay. Log every turn's duration. |
| SC-06 | Long-term memory persists across Telegram sessions within a single process run | SCEN-01..04 | End conversation, start new conversation in same process, verify agent recalls prior context (process restart not required) |
| SC-07 | KB retrieval returns relevant chunks | All | Test 10 sample questions, verify top-3 chunks are on-topic |
| SC-08 | User preferences affect agent behaviour | All | Set responseLength: 'short', verify brevity of responses |
| SC-09 | Onboarding flow works for unknown users | SCEN-00 | Use a Telegram ID not in mock data, verify number prompt and profile linking |
| SC-10 | Cancellation state machine runs in correct order | SCEN-04 | Trigger cancellation, verify agent follows INIT→REASON→OFFER→ESCALATED sequence |
| SC-11 | Inline keyboards appear for binary decisions | SCEN-02, 04 | Trigger plan change and retention offer, verify buttons appear |
| SC-12 | Error handling — no raw errors shown to user | All | Simulate tool failure, verify polite fallback + escalation |


## Non-happy paths (must be handled)

| Scenario | Edge case | Expected behaviour |
|---|---|---|
| SCEN-01 | User disputes invoice amount | Agent itemises via `getInvoice`, explains line items; if user still disputes, `escalateToHuman` with reason "billing dispute" |
| SCEN-02 | User asks for a plan that does not exist | Agent calls `listPlans`, replies with available options, asks user to pick |
| SCEN-03 | No outage AND diagnostic returns 'ok', but user insists | After 1 round of troubleshooting steps, `createTicket` with category "user-reported, diagnostic clean" |
| SCEN-04 | User changes their mind mid-cancellation | If user says "never mind" before `ESCALATED`, agent confirms, resets `cancellationState` to `INIT`, and ends the flow politely |
| SCEN-00 | User enters number in international format `+992...` | Phone normaliser strips country code; lookup proceeds normally |
| All | User sends a non-text message (photo, voice) | Reply (in detected or default language): "I can only read text messages right now." Do not advance any state machine. |
| All | Tool returns `{ success: false }` | Polite apology in user's language + `escalateToHuman(userId, error)` |
| All | Anthropic API times out (10s) | Reply "I'm having trouble right now, please try again in a moment." Keep session active. Do not escalate. |

## Demo script

A single linear walkthrough that exercises every scenario × language. Use this as the integration test until automated tests exist.

1. **SCEN-00 (English).** New Telegram account (persona #8). Send `/start` → expect multilingual greeting. Reply with `+992111222333` → expect "not found." Reply with `987111222` → expect Tajik greeting (persona #2's number). Confirm linkage works.
2. **SCEN-01 (Russian).** As persona #5 (frustrated, overdue). Ask "сколько я должен?" → expect `getInvoice` call, itemised breakdown, mention of overdue status.
3. **SCEN-02 (English).** As persona #3 (businessman). Ask "what plans do you have?" → expect `listPlans`. Ask "compare Connect and Unlimited Pro" → expect `comparePlans` + inline keyboard to switch.
4. **SCEN-02 inline keyboard.** Tap "✅ Yes, switch" → expect `changePlan` call, confirmation with effective date "first of next month".
5. **SCEN-03 (Tajik).** As persona #4 (rural). Ask "Интернет кор намекунад" → expect `checkOutage("Kulob")` + `runDiagnostic` in parallel. If outage active, expect ETA reply. If clean, expect troubleshooting steps; if user still complains, expect `createTicket`.
6. **SCEN-04 (Russian).** As persona #5. Say "хочу отключить услугу" → expect cancellationState progression: INIT → REASON_ASKED → OFFER_PRESENTED (with inline keyboard). Tap decline → expect ALTERNATIVE_PRESENTED. Tap decline → expect `escalateToHuman`.
7. **Memory check.** Without restarting the process, start a new conversation as persona #5. Ask any question → expect the agent's memory block to reference the prior session (e.g. "last time we discussed cancellation, offer declined").
8. **Language switch mid-conversation.** As any persona, send a message in Russian then a follow-up in English → expect the response language to switch immediately.
9. **Preferences update.** Say "please keep replies short" → expect `updateUserPreferences({ responseLength: 'short' })`, subsequent replies measurably shorter.

## Out of Scope

- Real database or external APIs
- Authentication, OTP, or identity verification
- Payment processing
- Web UI of any kind
- Voice message support
- Admin dashboard
- Disk-persistent long-term memory (next iteration)
- External embedding API for RAG (next iteration)
- Full multi-agent orchestration with handoff protocols (next iteration)
- Inactivity-based session timeout (next iteration)

## Decisions (previously open questions)

- **KB chunk language**: Tajik + Russian for question/answer text (the two NovaTel customer-facing languages), with multilingual `keywordTags` (Tajik, Russian, Uzbek, English) to drive TF-IDF retrieval. English and Uzbek replies are generated by the model from the Tajik/Russian content at inference time. Revisit if retrieval recall is poor.
- **Model**: Claude Sonnet 4.5 for the prototype. The four-language requirement (especially Tajik) and tool-calling fidelity are not safe to assume for smaller open models without testing. Configurable via `MODEL_NAME` if a switch is needed later.
- **Long-term memory storage**: In-process `Map<userId, LongTermMemory>` for the prototype. SQLite is a one-day swap if persistence across process restarts becomes a demo requirement — keep the read/write helpers in `memory/longTerm.ts` so the backend can change without touching call sites.
