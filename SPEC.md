# Telecom Support AI Agent

A conversational agent that handles real customer requests in Uzbek, Tajik, English and Russian — via Telegram — covering billing, plan changes, technical issues, and cancellations.

## Tech Stack

| **Component** | **Technology** |
|:---|:---|
| AI Framework | Mastra (TypeScript) |
| Channel | Telegram Bot |
| Data layer | In-memory JS objects (no database) |
| Model | Llama 4 Scout through Groq |
| RAG | Simple keyword/cosine search over KB chunks (in-memory) |
| Memory | Mastra Memory — short-term (thread) + long-term (persistent store) |
| Interface languages | Uzbek, Tajik, English, Russian |

## Functional Requirements

### Scenarios

SCEN-01 — Billing & payments
User can ask about their balance, last invoice, and next payment date. Agent returns data from the user's mock profile.

SCEN-02 — Plan change
User can browse available plans and switch to a different one. Agent compares plans, explains the difference, and confirms the change. Change takes effect "from next month" (mocked).

SCEN-03 — Technical support
User reports a connectivity or internet issue. Agent checks outage status for the user's region (mocked), provides basic troubleshooting steps. If unresolved, creates a ticket and returns a ticket number.

SCEN-04 — Cancellation & retention
User says they want to cancel. Agent asks for the reason, offers a discount or alternative plan. If user insists, agent confirms a human operator will follow up.

## Multilingual support

The agent MUST respond in the same language as the user's last message: Uzbek, Tajik, English or Russian. If the user switches languages within a conversation, the agent should adapt. No automatic language detection — the user's current language defines the session language.
Tajik, Russian and Uzbek use Cyrillic script.

## User Identification

Users are identified by ctx.from.id from Telegram. This ID maps to a mock profile in users.js. No login, OTP, or authentication flow is required.

## Mock Data

### Users - 20 personas

20 profiles will be defined in a separate data specification document. Each profile represents a distinct real-world persona (e.g. businessman, tourist, elderly person, remote area resident, student, etc.) to ensure scenario coverage across different needs, literacy levels, and language preferences.

Each profile will contain:
```
id, telegramId, name, persona, age,
language (tj/ru/uz/en), region,
plan, monthlyFee (Somoni),
dataUsedGB, dataLimitGB,
balance, nextBillDate, lastInvoiceAmount,
paymentStatus (paid/overdue/pending),
churnRisk (low/medium/high),
openTickets, deviceType,
preferences {}, interactionHistory []
```
Persona definition and full data population is deferred to the data specification phase.

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
Total|**Total tokens**|**~3100**|

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
| SC-02 | Response language matches user's language | Test in Tajik, Russian, Uzbek — verify response language |
| SC-03 | Agent never invents data | All figures must match mock profile values |
| SC-04 | No conversation reaches a dead end | Every path ends with resolution or escalation |
| SC-05 | Response arrives in under 5 seconds | Measure in Telegram |
| SC-06 | Long-term memory persists across sessions | End session, restart conversation, verify agent remembers prior context |
| SC-07 | KB retrieval returns relevant chunks | Test 10 sample questions, verify chunk relevance |
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
