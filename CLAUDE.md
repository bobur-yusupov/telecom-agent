# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram-based customer support AI agent called **Mirzo** for **NovaTel** (fictitious Tajikistan telecom). Handles billing, plan changes, technical support, and cancellation/retention in Uzbek, Tajik, English, and Russian. Single-agent design using Mastra + Groq Llama 4 Scout (prototype).

## Commands

```bash
npm run dev          # run with hot reload (tsx watch)
npm run start        # run once (tsx)
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm run lint         # ESLint over src/
npm run format       # Prettier over src/
```

No test suite yet — use the demo script in `spec/SCENARIOS.md` as the manual integration test.

## Environment Setup

Copy `.env.example` to `.env` and fill in real values:
```
TELEGRAM_TOKEN=...
GROQ_API_KEY=...
MODEL_NAME=meta-llama/llama-4-scout-17b-16e-instruct
LOG_LEVEL=info
AGENT_MODE=studio  # or telegram
```

## Architecture (single agent, Mastra)

```
Telegram (telegraf.js)
  → SCEN-00 check (known user by ctx.from.id?)
  → Per-chat mutex
  → Eager preload: getUserProfileById + searchKB in parallel
  → Context assembly (system prompt + memory block + KB chunks + history + current message)
  → Mirzo agent — selects tools and generates response in one pass
  → Tool calls (parallel where independent, sequential where dependent)
  → Response (action markers stripped → inline keyboard)
  → Session-end memory update → Telegram reply
```

All tools available every turn. No router agent — the model handles intent classification in one pass.

## Key Source Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — validates env, boots retriever, starts bot |
| `src/bot/telegram.ts` | Telegraf bootstrap, message + callback_query handlers, mutex |
| `src/bot/callbacks.ts` | Action marker parser, inline keyboard renderer |
| `src/agents/mirzo.ts` | Mastra agent definition + system prompt |
| `src/agents/cancellation.ts` | Cancellation FSM (SCEN-04) state transitions |
| `src/tools/common.ts` | `ToolResult<T>`, `searchKB`, `escalateToHuman` |
| `src/tools/user.ts` | `getUserProfileById`, `getUserProfileByNumber`, `updateUserPreferences` |
| `src/tools/billing.ts` | `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods` |
| `src/tools/plans.ts` | `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon` |
| `src/tools/technical.ts` | `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatus` |
| `src/tools/retention.ts` | `getRetentionOffers`, `applyDiscount` |
| `src/kb/chunks.ts` | 23 KB chunks (Tajik + Russian, multilingual keywordTags) |
| `src/kb/retriever.ts` | TF-IDF vectorisation at startup, cosine similarity at query time |
| `src/memory/longTerm.ts` | `Map<userId, LongTermMemory>`, read/write helpers |
| `src/memory/shortTerm.ts` | Mastra thread wrapper + cancellationState |
| `src/context/assemble.ts` | Builds system prompt + memory block + KB + history payload |
| `src/data/users.ts` | 8 mock personas + lookup helpers |
| `src/data/plans.ts` | Plan + addon catalog |
| `src/data/outages.ts` | Mock outage data per region |
| `src/utils/logger.ts` | Structured JSON logger (`LOG_LEVEL` env) |
| `src/utils/phone.ts` | `normaliseMobileNumber` — strips +992, leading 0, non-digits |

## Key Patterns

**ToolResult envelope** — every tool returns this:
```typescript
type ToolResult<T> = { success: true; data: T } | { success: false; error: string }
// helpers: ok(data), err(message) from src/tools/common.ts
```
On `success: false` → polite apology in user's language + `escalateToHuman(userId, error)`.

**Action markers** — agent appends to replies, post-processor in `bot/callbacks.ts` strips and renders as buttons:
```
[ACTION: confirm_plan_unlimited_pro]
[ACTION: accept_offer_RET-20PCT-3M | decline_offer_RET-20PCT-3M]
```

**Context assembly order** (every turn):
1. System prompt (~500 tokens)
2. Memory block from `longTerm.ts` (~300 tokens)
3. Top-3 KB chunks from `searchKB` — drop if score < 0.05 (~600 tokens)
4. Last 10 message pairs (~1500 tokens)
5. Current user message (~200 tokens)

**Long-term memory** — written once at session end only (not per-turn). Session ends on `escalateToHuman`, cancellation resolution, `/start`, or `/end`.

**Cancellation FSM** (`src/agents/cancellation.ts`):
`INIT → REASON_ASKED → OFFER_PRESENTED → OFFER_DECLINED → ALTERNATIVE_PRESENTED → ESCALATED`
Never skip steps. Never re-offer a discount in `offersShown`.

**Logging** — structured JSON via `logger` from `src/utils/logger.ts`. Required events: `turn.start`, `turn.end` (with `durationMs`), `tool.call`, `tool.error`, `kb.retrieve`, `agent.escalate`.

**Phone normalisation** — `normaliseMobileNumber` in `src/utils/phone.ts`. Accepts `987654321`, `+992987654321`, `0987654321`. Returns 9-digit string or `null`.

## Spec & Reference Docs

| File | Contents |
|---|---|
| `SPEC.md` | Index: tech stack, decisions, out of scope |
| `spec/SCENARIOS.md` | SCEN-00..04, multilingual rules, non-happy paths, demo script, AC |
| `spec/ARCHITECTURE.md` | Tool signatures, RAG pipeline, FSM, memory, context window, error handling |
| `spec/IMPLEMENTATION.md` | System prompt draft, inline keyboards, Telegram UX, concurrency, logging, file layout |
| `spec/DATA.md` | Personas, service catalog, user/preferences/interaction schemas |
| `FAQs.md` | Raw KB content — 23 chunks in Tajik + Russian across 6 topic groups |
