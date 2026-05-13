# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram-based customer support AI agent called **Mirzo** for **NovaTel**, a fictitious telecom in Tajikistan. It handles billing, plan changes, technical support, and cancellation/retention in Uzbek, Tajik, English, and Russian. The project is currently in the **specification phase** — no source code exists yet.

## Tech Stack

- **Framework**: Mastra (TypeScript) — single-agent design, Mastra Memory for short-term + long-term context
- **Channel**: Telegram Bot via `telegraf.js`
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5` via `@ai-sdk/anthropic`) — configurable via `MODEL_NAME` env var
- **RAG**: TF-IDF cosine similarity over in-memory KB chunks with multilingual keyword tags (built once at startup in `kb/retriever.ts`)
- **Data layer**: In-memory JS objects only — no database, no disk persistence for prototype

## Architecture (v0 — single agent)

```
Telegram (telegraf.js)
  → SCEN-00 check (known user by ctx.from.id?)
  → Per-chat mutex
  → Eager preload: getUserProfileById + searchKB in parallel
  → Context assembly (system prompt + memory block + KB chunks + history + current message)
  → Mirzo agent — selects tools and generates response in one pass
  → Tool calls (parallel where independent, sequential where dependent)
  → Response (with action markers stripped → inline keyboard)
  → Session-end memory update (if applicable) → Telegram reply
```

**No Router Agent.** All tools are available to the single Mirzo agent every turn — Claude Sonnet 4.5 handles intent classification + tool selection in one pass. Revisit multi-agent decomposition only if routing fails in testing.

**No pre-translation step.** KB chunks have multilingual `keywordTags` (Tajik + Russian + Uzbek + English), so TF-IDF retrieval works directly on the user's query in any supported language.

### Tool grouping (documentation only; all tools available every turn)
- **User & profile**: `getUserProfileById`, `getUserProfileByNumber`, `updateUserPreferences`
- **Billing**: `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods`
- **Plans**: `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon`
- **Technical**: `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatus`
- **Retention**: `getRetentionOffers`, `applyDiscount`
- **Cross-cutting**: `searchKB`, `escalateToHuman`

## Key Implementation Details

### All tools return a typed envelope
```typescript
type ToolResult<T> = { success: true; data: T } | { success: false; error: string }
```
On any `success: false`, the agent must call `escalateToHuman(userId, error)` and respond with a polite apology — never surface raw error strings.

### Context assembly order (every turn)
1. System prompt (role + language rules + cancellation flow + action markers)
2. Memory block (user preferences + long-term `summary` + relevant flags like `offersShown`)
3. Top-3 KB chunks from `searchKB` (dropped if score < 0.05)
4. Sliding window: last 10 message pairs
5. Current user message

Token budget: ~3100 tokens. See SPEC.md "Context window strategy" for per-layer limits.

### Inline keyboards via action markers
The agent emits action markers at the end of replies, e.g. `[ACTION: confirm_plan_unlimited_pro]` or `[ACTION: accept_offer_RET-20PCT-3M | decline_offer_RET-20PCT-3M]`. A post-processor in `bot/callbacks.ts` strips these from user-visible text and renders inline keyboard buttons.

When the user taps a button, the bot injects a synthetic English user message `"[User selected: <callback_data>]"` and re-runs the agent turn. This keeps the loop uniform — every turn starts with a user message, typed or tapped.

### Cancellation state machine (SCEN-04)
Stored in short-term memory as `cancellationState`. States: `INIT → REASON_ASKED → OFFER_PRESENTED → OFFER_DECLINED → ALTERNATIVE_PRESENTED → ESCALATED`. The system prompt explicitly walks the agent through transitions; never skip steps or re-offer a declined discount (check `longTermMemory.offersShown`).

### Long-term memory
- Stored in a `Map<userId, LongTermMemory>` — in-process only, not persisted to disk.
- Written **once at session end** (`escalateToHuman`, cancellation resolution, `/start`, `/end`). The agent generates a 1–2 sentence `summary`; the bot updates `totalInteractions`, `lastInteractionDate`, and any of `offersShown`/`previousPlans`/`resolvedIssues`/`satisfactionSignals` that were touched.
- Read-only within a session — in-session continuity comes from short-term memory.

### User identification & SCEN-00
`ctx.from.id` maps to a mock profile in `src/data/users.ts`. Unknown IDs trigger SCEN-00: multilingual greeting in one combined message, user replies with phone number, `phone.ts` normalises to canonical 9-digit form (strips `+992`, leading `0`, non-digits), `getUserProfileByNumber` lookup. 3 failed attempts (invalid format or not found, combined) → `escalateToHuman()`.

### Concurrency
Per-chat `Map<chatId, Promise<void>>` mutex. New messages await prior turn before starting. Queue depth capped at 3 per chat.

### Logging
Structured JSON to stdout, `LOG_LEVEL` env var controls verbosity. Required events: `turn.start`/`turn.end` with `durationMs` (for SC-05), `tool.call`/`tool.error`, `kb.retrieve`, `agent.escalate`.

### Telegram UX constraints
- Send `ctx.sendChatAction('typing')` before any LLM or tool call.
- Wrap all Anthropic API calls in a 10-second timeout. On timeout, reply with a transient error message — do not escalate, keep session active.
- Split responses over 3800 chars at paragraph (`\n\n`) boundaries.

### Environment variables
```
TELEGRAM_TOKEN=...
ANTHROPIC_API_KEY=...
MODEL_NAME=claude-sonnet-4-5
LOG_LEVEL=info
```

## File / module layout (planned)

```
src/
  bot/           # telegraf bootstrap, message + callback_query handlers, mutex
  agents/        # mirzo.ts (single agent + system prompt), cancellation.ts (FSM)
  tools/         # user, billing, plans, technical, retention, common (searchKB + escalate + ToolResult)
  kb/            # chunks.ts (23 chunks), retriever.ts (TF-IDF)
  memory/        # shortTerm (Mastra thread + cancellationState), longTerm (Map)
  data/          # users.ts (8 personas), plans.ts, outages.ts
  context/       # assemble.ts — builds system prompt + memory + KB + history
  utils/         # logger.ts, phone.ts (normaliseMobileNumber)
  index.ts       # entry: boot retriever, then start bot
```

## Key Reference Files

- `SPEC.md` — full specification: scenarios, tool signatures, KB structure, system prompt draft, file layout, demo script, non-happy paths, acceptance criteria
- `FAQs.md` — 23 KB chunks in Tajik + Russian across 6 topic groups (Billing, Top-Up, Plans, Technical, Roaming, Cancellation/Retention) — the raw KB data source
