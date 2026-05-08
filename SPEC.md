# Telecom Support AI Agent

A conversational agent that handles real customer requests in Uzbek, Tajik, English and Russian — via Telegram — covering billing, plan changes, technical issues, and cancellations.

## Tech Stack

| **Component** | **Technology** |
|:---|:---|
| AI Framework | Mastra (TypeScript) |
| Channel | Telegram Bot |
| Data layer | In-memory JS objects (no database) |
| Model | Claude Sonnet 4.6 |
| RAG | Cross-lingual query translation + TF-IDF cosine search over KB chunks (in-memory) |
| Memory | Mastra Memory — short-term (thread) + long-term (in-memory Map) |
| Interface languages | Uzbek, Tajik, English, Russian |

## Model Configuration
The model is configurable via environment variables — no code change required to swap providers:
```
# .env
TELEGRAM_TOKEN=...
ANTHROPIC_API_KEY=...
MODEL_NAME=claude-sonnet-4-20250514   # swap to any supported model
```

Initializing model in Mastra:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
const model = anthropic(process.env.MODEL_NAME)
```

## Functional Requirements

### Scenarios

**SCEN-00 - User Onboarding (first-time user)**
1. User sends any message or `/start` command
2. Bot checks: does ctx.from.id match any mock profile?
3. If YES → load profile, proceed normally
4. If NO → bot replies: "Welcome to NovaTel support. Please enter your NovaTel mobile number to continue."
5. User replies with their number (e.g. 987654321)
6. Bot calls `getUserProfileByNumber("987654321")`
7. If found → link telegramId to profile, proceed normally
8. If not found → reply: "Number not found. Please check and try again."
9. After 3 failed attempts → call `escalateToHuman()`

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

**Cross-lingual note:** KB chunks are authored in Tajik and Russian. Before running retrieval, the agent translates the user query to *Russian (I should ask this part from Muhammad Aka for further feedback)* to ensure consistent keyword overlap regardless of the user's input language. The response is then generated in the user's original language.

**Uzbek/Tajik disambiguation:** Both languages use Cyrillic. Disambiguation relies on vocabulary patterns — the model is instructed to treat ambiguous inputs as Russian and ask for clarification if needed.

## User Identification

Users are identified by `ctx.from.id` from Telegram. This ID maps to a mock profile in `users.ts`. If no match is found, **SCEN-00** (onboarding) is triggered. No login, OTP, or authentication flow is required.

## Mock Data

### Users - 20 personas

20 profiles will be defined in a separate data specification document. Each profile represents a distinct real-world persona (e.g. businessman, tourist, elderly person, remote area resident, student, etc.) to ensure scenario coverage across different needs, literacy levels, and language preferences.

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

```
Telegram Bot (telegraf.js)
        ↓
  **SCEN-00** check (is user known?)
        ↓
  Context assembly
  (system prompt + memory block + KB chunks + history)
        ↓
  Router Agent
  — classifies intent: billing | technical | plans | retention
        ↓
  ┌─────────────┬──────────────┬─────────────┬──────────────────┐
  │ Billing     │ Technical    │ Plans       │ Retention        │
  │ Agent       │ Agent        │ Agent       │ Agent            │
  └─────────────┴──────────────┴─────────────┴──────────────────┘
        ↓
  Tool calls — parallel where possible, sequential where dependent
        ↓
  Response generation
        ↓
  Memory update (event-triggered, long-term store)
        ↓
  Telegram reply
```

### Tool access per agent

| Agent | Tools |
| --- | --- |
| **Router** | `getUserProfileById`, `getUserProfileByNumber`, `searchKB` |
| **Billing Agent** | `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods` |
| **Technical Agent** | `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatusPlans` |
| **Plans Agent** | `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon` |
| **Retention Agent** | `getRetentionOffers`, `applyDiscount`, `escalateToHuman` |
| **All agents** | `updateUserPreferences`, `searchKB`, `escalateToHuman` |

### Tool execution strategy
Tools that do not depend on each other's output are called in parallel. Tools with data dependencies are called sequentially.

```
Parallel example:
  `getUserProfileById(userId)` + `searchKB(query)` → run together at turn start

Sequential example:
  `getUserProfileById(userId)` → `getRetentionOffers(userId)`
  (profile needed to determine churn risk before fetching offers)
```

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
```typescript
  { offerId: "RET-20PCT-3M", description: "20% discount for 3 months", savingSomoni: 24 },
  { offerId: "RET-FREE-DATA", description: "1 free month of extra 10GB", savingSomoni: 55 }
```

`applyDiscount(userId: number, offerId: string)`
- Input: user ID + offer ID
- Output: { confirmation: string, newMonthlyFee: number, validUntil: string }

`escalateToHuman(userId: number, reason: string)`
- Input: user ID + reason string
- Output: { confirmation: string, referenceId: string, message: string }

### Knowledge base tool

`searchKB(query: string, topK: number)`
- Input: natural language query (pre-translated to Russian) + number of results
- Output: array of matching KB chunks with relevance score
```typescript
[{ chunkId: string, group: string, score: number, question: string, answer: string }]
```

------------------------------------

## Knowledge Base & RAG

### Structure
The KB consists of 21 pre-defined chunks across 5 topic groups:

| Group | Chunk IDs | Count | Type |
| --- | --- | --- | --- |
| Billing & payments | BIL-001..005 | 5 | FAQ + KB |
| Top-up & balance | TOP-001..004 | 4 | FAQ + KB |
| Plans & upgrades | PLN-001..004 | 4 | FAQ + KB |
| Technical support | TEC-001..005 | 5 | FAQ + KB |
| Cancellation & retention | RET-001..003 | 3 | FAQ + KB |
| **Total** | | **21** | |

Each chunk contains: chunk ID, topic group, question (Tajik + Russian), answer (Tajik + Russian), type (FAQ or KB), tool tags, keyword tags. English and Uzbek responses are generated by the model from the Tajik/Russian chunk content at inference time — chunks are not duplicated in those languages.

### RAG pipeline
User message (any language)
     ↓
Translate query to Russian (1 fast LLM call) <---> need to ask
     ↓
searchKB(russianQuery, topK=3)
     ↓
TF-IDF cosine similarity over pre-computed chunk vectors (built at startup)
     ↓
Top-3 chunks injected into agent context
     ↓
Agent decides:
  — answer from KB alone (general/policy questions)
  — KB + tool call combined (user-specific questions)
  — no match → escalateToHuman()

### Retrieval implementation (prototype)
On bot startup, retriever.ts builds TF-IDF vectors from each chunk's keywordTags array. This runs once synchronously before the bot accepts messages. Vectors are stored as a plain array of { chunkId, vector } objects. Cosine similarity is computed at query time across all 21 vectors — at this scale no indexing is needed.
If retrieval quality proves insufficient for Uzbek or English queries, the next iteration will replace TF-IDF with multilingual embeddings (e.g. multilingual-e5-large).

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

### Long-term memory (across sessions)
Persisted in a JavaScript Map keyed by userId. Survives bot restarts during a single process run. Not persisted to disk for the prototype.
```typescript
longTermMemory: {
  userId: string,
  lastInteractionDate: string,           // ISO 8601
  resolvedIssues: string[],              // previously resolved issue types
  previousPlans: string[],              // plans the user has been on
  offersShown: string[],                // retention offer IDs already presented
  totalInteractions: number,
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[],
}
```
Long-term memory write triggers
Long-term memory is written only when one of the following events occurs — all other turns are read-only:

| Event | Fields updated |
| ------ | ------ |
| Plan changed | `previousPlans`, `lastInteractionDate` |
| Ticket created | `resolvedIssues` (pending), `lastInteractionDate` |
| Ticket resolved | `resolvedIssues` (resolved) |
| Discount applied | `offersShown`, `lastInteractionDate` |
| Discount declined | `offersShown`, `satisfactionSignals` |
| Session ended cleanly | `totalInteractions`, `lastInteractionDate` |
| Positive/negative signal | `detectedsatisfactionSignals` |

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


## Acceptance Criteria

| ID | Criterion | Linked scenario | How to verify |
|---|---|---|---|
| SC-01 | All 4 scenarios complete without errors | SCEN-01..04 | Manual run of each scenario in Telegram |
| SC-02 | Response language matches user's language | All | Send messages in Tajik, Russian, Uzbek, English — verify response language |
| SC-03 | Agent never invents data | All | All figures must match mock profile values exactly |
| SC-04 | No conversation reaches a dead end | All | Every path ends with resolution or escalateToHuman() |
| SC-05 | Response arrives in under 5 seconds | All | Measure response time in Telegram |
| SC-06 | Long-term memory persists across sessions | SCEN-01..04 | End session, restart conversation, verify agent recalls prior context |
| SC-07 | KB retrieval returns relevant chunks | All | Test 10 sample questions, verify top-3 chunks are on-topic |
| SC-08 | User preferences affect agent behaviour | All | Set responseLength: 'short', verify brevity of responses |
| SC-09 | Onboarding flow works for unknown users | SCEN-00 | Use a Telegram ID not in mock data, verify number prompt and profile linking |
| SC-10 | Cancellation state machine runs in correct order | SCEN-04 | Trigger cancellation, verify agent follows INIT→REASON→OFFER→ESCALATED sequence |
| SC-11 | Inline keyboards appear for binary decisions | SCEN-02, 04 | Trigger plan change and retention offer, verify buttons appear |
| SC-12 | Error handling — no raw errors shown to user | All | Simulate tool failure, verify polite fallback + escalation |


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

## Questions

- Which language should I use for saving chunks in Knowledge Base?
- What model should I use for the agent? Is Llama or GPT-OSS is good for prototype? Should I go with Claude?
- Is in-process JavaScript Map enough for for long-term memory or should I use external database? Maybe SQLite?
