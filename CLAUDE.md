# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram-based customer support AI agent called **Mirzo** for **NovaTel** (fictitious Tajikistan telecom). Handles billing, plan changes, technical support, and cancellation/retention in Uzbek, Tajik, English, and Russian. Single-agent design using Mastra, defaulting to Google Gemini 3.1 Flash Lite (prototype) — flaggable to OpenAI or DeepSeek via `MODEL_PROVIDER` for model evaluation (see [Model provider flagging](#model-provider-flagging)).

## Commands

```bash
docker compose up -d # start Postgres + pgvector
npm run dev          # run with hot reload (tsx watch)
npm run start        # run once (tsx)
npm run build        # compile TypeScript → dist/
npm run typecheck    # type-check without emitting
npm run lint         # ESLint over src/
npm run format       # Prettier over src/
npm run eval         # run scenario + grounding evals (vitest)
npm run eval:watch   # watch mode
npm run eval:ci      # full suite against an ephemeral in-RAM Postgres (scripts/eval.sh)
npm run gen:dataset  # regenerate eval-data/dataset.json (scripts/gen-dataset.sh)
npm run db:reset     # truncate + re-seed app tables back to baseline (scripts/reset-db.ts)
```

Postgres needs to be running before anything else — `src/index.ts` boots `initDb()` (creates schemas, runs migrations, seeds users/plans/addons/outages) and then `buildRetriever()` (creates the pgvector index, embeds + upserts the 23 KB chunks via local Ollama embeddings).

## Evals

`tests/` runs scripted conversations through the live Mirzo agent and asserts on tool calls + replies.

| File | Checks |
|---|---|
| [tests/scenarios.eval.ts](tests/scenarios.eval.ts) | Deterministic: which tool got called, in what order, language detection, no-mutation-without-confirmation |
| [tests/grounding.eval.ts](tests/grounding.eval.ts) | One LLM-as-judge grounding check using `@mastra/evals` |
| [tests/dataset.eval.ts](tests/dataset.eval.ts) | Batch-scores `eval-data/dataset.json` (faithfulness + answer-relevancy). **Skips if the file is missing** — generate it first with `npm run gen:dataset` |
| [tests/runtime.test.ts](tests/runtime.test.ts) | Unit tests for the runtime (mutex, lifecycle, identity) — no live model calls |
| [tests/helpers/runConversation.ts](tests/helpers/runConversation.ts) | Shared harness: `runConversation`, `resetUserState`, `rateLimitDelay` |

`npm run gen:dataset` ([scripts/gen-dataset.sh](scripts/gen-dataset.sh)) boots an ephemeral DB and runs curated conversations through Mirzo to produce `eval-data/dataset.json`. `npm run eval:ci` ([scripts/eval.sh](scripts/eval.sh)) runs the full suite against that same ephemeral in-RAM Postgres.

Free-tier Gemini caps at 15 RPM — the harness paces turns at 4.5s each via `EVAL_TURN_DELAY_MS`. Set `EVAL_TURN_DELAY_MS=0` on a paid tier. Full suite takes ~4 min on free tier.

### Model provider flagging

`MODEL_PROVIDER` (`gemini` | `openai` | `deepseek`, default `gemini`) picks which provider powers **Mirzo itself** — both the live bot and any eval that drives the live agent (`npm run eval`, `npm run gen:dataset`) — via `chatModel` in [src/agents/provider.ts](src/agents/provider.ts). `MODEL_NAME` overrides the model id within that provider; each provider has a sane default if unset. Convenience scripts: `npm run eval:ci:gemini` / `:openai` / `:deepseek` and `npm run gen:dataset:gemini` / `:openai` / `:deepseek`.

The **LLM-judge scorers** (faithfulness, `scopeEnforcementScorer`, `languageCorrectnessScorer`, `toolCallCorrectnessScorer`, `answerRelevancy` in [src/mastra/index.ts](src/mastra/index.ts)) are intentionally pinned to the separate `google` export and never follow `MODEL_PROVIDER` — the judge must stay fixed so scores are comparable across providers under test.

Requires `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` when flagged to those providers. `@ai-sdk/openai` and `@ai-sdk/deepseek` are pinned to their `3.x`/`2.x` majors (not latest) to match the `@ai-sdk/provider` v3 spec that `@ai-sdk/google` and this Mastra version use — bumping either to latest breaks the build with a `LanguageModelV4` type mismatch.

## Environment Setup

Copy `.env.example` to `.env` and fill in real values:
```
TELEGRAM_TOKEN=...
MODEL_PROVIDER=gemini
MODEL_NAME=gemini-3.1-flash-lite
GOOGLE_API_KEY=...
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_HOST=http://localhost:11434
LOG_LEVEL=info
```

The Gemini key uses `GOOGLE_API_KEY` (the name Mastra Studio prompts for); the legacy `GOOGLE_GENERATIVE_AI_API_KEY` is still accepted as a fallback. Which provider is actually in use is controlled by `MODEL_PROVIDER` — see [Model provider flagging](#model-provider-flagging) above. Embeddings run locally via Ollama — `EMBEDDING_MODEL`/`OLLAMA_HOST`.

## Architecture (single agent, Mastra)

The agent is **channel-agnostic**. A channel adapter translates its platform
events into `InboundMessage`/`OutboundMessage` and calls the runtime; nothing in
the runtime or agent knows about a specific channel. Adding a channel = one
adapter file, no changes to the agent.

```
Channel adapter (src/channels/telegram.ts, …)
  → InboundMessage { conversationId, channel, externalUserId, text, command? }
  → runtime.handleTurn (src/runtime/runtime.ts)
      → per-conversation mutex + queue cap (max 3)
      → /start /end lifecycle, non-text guard
      → identity: resolveUserId(channel, externalUserId) via app.channel_identities
          ↳ unknown → SCEN-00 onboarding (deterministic, 3-attempt limit) → bind
      → eager preload: getUserById + searchKB (+ memory + cancellation state) in parallel
      → context assembly → injected as a system `context` message
  → Mirzo agent — selects tools and generates response in one pass
  → Tool calls (parallel where independent, sequential where dependent)
  → Plain-text reply (confirmations are natural language; user replies "yes"/"no")
  → Session-end memory update → OutboundMessage(s) → channel renders/splits
```

All tools available every turn. No router agent — the model handles intent classification in one pass.
The Mirzo agent is also exposed directly in Mastra Studio for development (bypasses the runtime, so onboarding does not run there).

## Key Source Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — validates env, boots DB + retriever, starts configured channels |
| `src/runtime/types.ts` | Channel-agnostic contracts: `InboundMessage`, `OutboundMessage`, `ChannelContext` |
| `src/runtime/runtime.ts` | `handleTurn` — mutex, queue cap, lifecycle, non-text guard, agent invocation |
| `src/runtime/identity.ts` | `resolveUserId` / `bindIdentity` over `app.channel_identities` |
| `src/runtime/onboarding.ts` | Deterministic SCEN-00 (greeting, 3-attempt limit, multilingual prompts) |
| `src/runtime/context.ts` | Per-turn context preload (profile + KB + memory) → system `context` message |
| `src/channels/telegram.ts` | Telegram adapter: Telegraf ↔ runtime, typing, message splitting |
| `src/agents/mirzo.ts` | Mastra agent definition + system prompt (channel-agnostic) |
| `src/agents/provider.ts` | `chatModel` (flagged via `MODEL_PROVIDER`: gemini/openai/deepseek) for Mirzo itself, plus the separate `google` export used as the fixed eval-judge model |
| `src/agents/cancellation.ts` | Cancellation FSM (SCEN-04) state transitions |
| `src/mastra/index.ts` | Mastra instance — registers `mirzo`, `PostgresStore`, and scorers (`scopeEnforcementScorer`, `answerRelevancy`); also exposes the agent in Mastra Studio |
| `src/eval/scope-enforcement-scorer.ts` | Custom LLM-judge scorer — flags responses that engage with out-of-scope content |
| `src/tools/common.ts` | `ToolResult<T>`, `searchKB`, `escalateToHuman` |
| `src/tools/user.ts` | `getUserProfileById`, `getUserProfileByNumber`, `updateUserPreferences` |
| `src/tools/billing.ts` | `getBalance`, `getInvoice`, `applyCredit`, `getPaymentMethods` |
| `src/tools/plans.ts` | `listPlans`, `comparePlans`, `changePlan`, `getDataAddons`, `purchaseAddon` |
| `src/tools/technical.ts` | `checkOutage`, `runDiagnostic`, `createTicket`, `getTicketStatus` |
| `src/tools/retention.ts` | `getRetentionOffers`, `applyDiscount` |
| `src/kb/chunks.ts` | 23 KB chunks (Tajik + Russian, multilingual keywordTags) |
| `src/kb/retriever.ts` | pgvector index + local Ollama embeddings (`nomic-embed-text`, 768-dim) at startup, cosine similarity at query time |
| `src/memory/longTerm.ts` | Long-term memory CRUD (Postgres-backed) + `endSession` writer |
| `src/db/client.ts` | `pg.Pool` singleton + `getPgConfig()` |
| `src/db/schema.ts` | DDL for `app.*` tables (users, plans, addons, outages, tickets, escalations, long_term_memory, cancellation_states, session_presented_offers, channel_identities, onboarding_states) |
| `src/db/init.ts` | Runs schema + seeds users/plans/addons/outages + Telegram channel_identities from `src/data/seeds/` |
| `src/data/users.ts` | Async DB-backed user repository (`getUserById`, `updateUser`, etc.) |
| `src/data/plans.ts` | Async DB-backed plan + addon repository |
| `src/data/outages.ts` | Async DB-backed outage repository |
| `src/data/seeds/*.ts` | Mock data arrays — single source of truth for `initDb` seeding |
| `src/data/dataset.ts` | One-shot helper that uploads the curated eval cases to a Mastra Studio dataset (run manually) |
| `scripts/gen-dataset.ts` | Runs curated conversations through Mirzo → writes `eval-data/dataset.json` (invoked by `scripts/gen-dataset.sh`) |
| `src/utils/logger.ts` | Structured JSON logger (`LOG_LEVEL` env) |
| `src/utils/phone.ts` | `normaliseMobileNumber` — strips +992, leading 0, non-digits |

## Key Patterns

**ToolResult envelope** — every tool returns this:
```typescript
type ToolResult<T> = { success: true; data: T } | { success: false; error: string }
// helpers: ok(data), err(message) from src/tools/common.ts
```
On `success: false` → polite apology in user's language + `escalateToHuman(userId, error)`.

**Confirmations** — agent asks in plain language ("Shall I switch you to Connect? Reply yes to confirm.") and waits for a natural-language reply. Destructive tools (`changePlan`, `purchaseAddon`, `applyCredit`, `applyDiscount`, `updateUserPreferences`) are only invoked after explicit user confirmation.

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
