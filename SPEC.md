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
  SCEN-00 check (is user known?)
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

## Tools

All tools are pure TypeScript functions returning mock data. No external API calls.

### User & account tools

`getUserProfileByNumber(mobileNumber: string)`
- Input - string, e.g. "987654321"
- Output - Full mock profile object

`getUserProfileById(userId: number)`
- Input - number, user id
- Output - Full mock profile object

`getInvoice(userId: number)`
- Input - number, user id
- Output - invoice data

`updateUserPreferences(userId, prefs)`
- Input - number, user id and preferences object
- Output - updated user profile object

### Plan & catalog tools

`listPlans()`
- Input - none
- Output - array of all available plans

`comparePlans(planIdA, planIdB)`
- Input - plan1 id, plan2 id
- Output - Side-by-side diff object

`changePlan(userId, planId)`
- Input - number, user id and plan ID
- Output - Confirmation + effective date

`getDataAddons()`
- Input - none
- Output - array of all available data addons

`purchaseAddon(userId, addonId)`

### Technical support tools

`checkOutage(region)`
- Input - string, region name
- Output - outage status: active/clear + estimated resolution

`runDiagnostic(userId)`
- Input - number, user id
- Output - mocked line diagnostic result

`createTicket(userId, issue)`
- Input - number, user id and issue description
- Output - ticket number + estimated resolution time

`getTicketStatus(ticketId)`
- Input - number, ticket id
- Output - current status + last update

### Billing tools

`getBalance(userId)`
- Input - number, user id
- Output - current balance in Somoni

`applyCredit(userId, amount)`
- Input - number, user id and amount
- Output - new balance after credit

`getPaymentMethods()`
- Input - none
- Output - list of available payment methods in Tajikistan

### Retention tools

`getRetentionOffers(userId)`
- Input - number, user id
- Output - personalized offers based on churn risk + plan

`applyDiscount(userId, offerId)`
- Input - number, user id and offer id
- Output - confirmation + new monthly fee

`escalateToHuman(userId, reason)`
- Input - number, user id and reason
- Output - confirmation that operator will follow up

### Knowledge base tool

`searchKB(query, topK)`
- Input - natural language query + number of results
- Output - array of matching KB chunks with relevance score

## Knowledge Base & RAG

### Structure
The KB consists of 24 pre-defined chunks across 6 topic groups:

| Group | Chunk IDs | Type |
| --- | --- | --- |
| Billing & payments | BIL-001..005 | FAQ + KB |
| Top-up & balance | TOP-001..004 | FAQ + KB |
| Plans & upgrades | PLN-001..004 | FAQ + KB |
| Technical support | TEC-001..005 | FAQ + KB |
| Cancellation & retention | RET-001..003 | FAQ + KB |

Each chunk contains: chunk ID, topic group, question (in Tajik + Russian), answer (in Tajik + Russian), type (FAQ or KB), tool tags, and keyword tags.
Uzbek responses are generated by the model from the Tajik/Russian chunk content — chunks are not duplicated in Uzbek.

### RAG pipeline
User message
     ↓
T-19: searchKB(query, topK=3)
     ↓
Keyword match + optional cosine similarity
over pre-computed chunk embeddings (in-memory array)
     ↓
Top-K chunks injected into agent context
     ↓
Agent decides: answer from KB alone,
or combine KB + tool call for user-specific data

### Retrieval decision logic
The agent follows this priority order:

If the question is general policy or how-to → retrieve KB chunk, answer directly.
If the question requires user-specific data (balance, invoice, plan) → call tool, optionally enrich with KB context.
If KB returns no relevant chunk and no tool applies → escalate to human via T-18.

### Chunk embedding (prototype approach)
For the prototype, cosine similarity is computed over simple TF-IDF vectors built at startup from chunk keyword tags. No external embedding API is called. If this proves insufficient, the next iteration will use Anthropic embeddings.

## User Preferences
Each user profile includes a preferences object that persists across sessions and influences agent behavior.

### Preference schema
```typescript
preferences: {
  language: 'uz' | 'tj' | 'ru' | 'en',  // preferred response language
  responseLength: 'short' | 'detailed',   // brevity preference
  communicationStyle: 'formal' | 'casual',
  topupReminderEnabled: boolean,           // remind when balance is low
  lowBalanceThreshold: number,             // Somoni amount that triggers reminder
  preferredPaymentMethod: string | null,   // e.g. 'Alifmobi', 'Esxata Mobile', 'DC'
  lastKnownIssue: string | null,           // last reported technical issue type
}
```

### Preference usage
The agent reads preferences at the start of every conversation and adjusts accordingly: language, tone, response length, and whether to proactively mention low balance. Preferences can be updated mid-conversation via T-03 if the user explicitly requests a change (e.g. "please be more brief").

## Memory

### Short-term memory (within session)
Managed by Mastra's built-in thread context. Stores the full message history of the current Telegram conversation. Resets when the user starts a new session (new /start command or after a configurable inactivity timeout of 30 minutes).
Used for: maintaining conversational coherence, avoiding repeated questions, tracking what the agent has already offered in the current session (e.g. not offering the same discount twice).

### Long-term memory (across sessions)
Persisted in a simple in-memory store (JavaScript Map keyed by userId) that survives bot restarts during a single process run. For the prototype, this is not persisted to disk.
```typescript
longTermMemory: {
  userId: string,
  lastInteractionDate: string,
  resolvedIssues: string[],         // list of previously resolved issue types
  previousPlans: string[],          // plans the user has been on
  offersShown: string[],            // retention offer IDs already presented
  totalInteractions: number,
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[],
}
```
Used for: not repeating offers already rejected, recognising returning users, tailoring retention strategy based on history.

### Memory injection into context
At the start of each conversation turn, Mastra injects a summarised memory block into the system prompt context:

```
[Memory]
Last interaction: 3 days ago — resolved: internet outage in Dushanbe.
Offers already shown: 20% discount (declined).
User's preferred language: Russian. Style: casual, short responses.
Current plan: Connect (50GB). Balance: 12 Somoni (low).
```
This keeps the model context lean while ensuring the agent behaves like it remembers the user.

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
Conversation history is trimmed to the last 10 message pairs. Older messages are dropped. If a critical fact from an older message is needed, it should already be captured in long-term memory or the current tool call result.

### Context assembly order
Every turn, the agent context is assembled in this exact order:

```
1. System prompt (role + rules + language instruction)
2. Memory block (user preferences + long-term summary)
3. Retrieved KB chunks (from T-19, if relevant)
4. Sliding window conversation history (last 10 pairs)
5. Current user message
```

### Tool result handling
Tool results are injected as assistant-side context immediately after the tool call, before the agent generates its response. They are not added to long-term memory unless explicitly flagged (e.g. a resolved ticket ID is saved to resolvedIssues).

## Mastra Architecture

```
Telegram Bot (telegraf.js)
        ↓
  Context assembly
  (system prompt + memory block + KB chunks + history)
        ↓
  Mastra Agent (single agent, prototype)
        ↓
  Tool calls (T-01..T-19) — as needed, parallel where possible
        ↓
  Response generation
        ↓
  Memory update (long-term store)
        ↓
  Telegram reply
```
Note: A single well-prompted agent is sufficient for this prototype. Multi-agent routing is deferred to the next iteration.

## System Prompt Requirements

The system prompt must specify:

- **Role**: "You are a customer support AI agent for NovaTel, a telecom company in Tajikistan."
- **Language rule**: Always respond in the exact language the user writes in. Never switch languages within a reply. Uzbek uses Cyrillic script.
- **Data integrity**: Never invent numbers, plan names, or prices. Always call the appropriate tool to retrieve user-specific information.
- **KB usage**: Before answering a general question, always search the KB first via T-19.
- **Fallback**: If no KB chunk matches and no tool applies, use T-18 to escalate. Never leave a dead end.
- **Tone**: Match the user's communication style preference. Default to polite, concise, and conversational.
- **Memory awareness**: Use the injected memory block to personalise responses. Do not re-offer discounts already declined.
- **Identity**: Never claim to be ChatGPT, GPT, or any other AI system.


## Acceptance Criteria

| ID | Criterion | How to verify |
|---|---|---|
| SC-01 | All 4 scenarios complete without errors | Manual run of each scenario in Telegram |
| SC-02 | Response language matches user's language | Send messages in Tajik, Russian, Uzbek, English — verify response language |
| SC-03 | Agent never invents data | All figures must match mock profile values |
| SC-04 | No conversation reaches a dead end | Every path ends with resolution or escalation to human |
| SC-05 | Response arrives in under 5 seconds | Measure response time in Telegram |
| SC-06 | Long-term memory persists across sessions | End session, restart conversation, verify agent remembers prior context |
| SC-07 | KB retrieval returns relevant chunks | Test 10 sample questions, verify top-3 chunks are on-topic |
| SC-08 | User preferences affect agent behavior | Change responseLength to 'short', verify brevity |

## Out of Scope

- Real database or external APIs
- Authentication, OTP, or identity verification
- Payment processing
- Web UI of any kind
- Multi-agent routing (next iteration)
- Voice message support
- Admin dashboard
- Disk-persistent long-term memory (next iteration)
- External embedding API for RAG (next iteration)
