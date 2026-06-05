# Mirzo — Open Tasks

Gap analysis against `spec/`, `spec/ARCHITECTURE.md`, `spec/IMPLEMENTATION.md`, and `spec/SCENARIOS.md`.

---

## Done — Eval infrastructure & tooling

Harness work so scenario/grounding evals run deterministically, plus a reusable
dataset for Mastra Studio experiments and headless scoring.

- [x] **Ephemeral in-RAM test DB** — `docker-compose.test.yml` (tmpfs Postgres on port 5433, project `mirzo-test`), isolated from the main compose project. `tests/setup.ts` truncates + re-seeds fresh each run, so no cross-run drift.
- [x] **Scripts + npm aliases** — `scripts/start-test-db.sh`, `scripts/eval.sh` (boots ephemeral DB, tears down on exit), `scripts/gen-dataset.sh`, `scripts/reset-db.ts`. npm: `eval:ci`, `gen:dataset`, `db:reset`.
- [x] **Rate-limit handling** — `runConversation` paces every turn (5s) and retries on 429 (parses `retry in Xs`), so free-tier Gemini bursts don't fail the suite.
- [x] **Within-run data isolation** — `resetUserState` restores mutable user fields from seed before each test.
- [x] **Grounding eval fixed** — faithfulness scorer reads `GOOGLE_API_KEY` via the shared provider and is fed actual tool-result payloads as context (was passing call signatures → always scored 0).
- [x] **Eval dataset generator** — `scripts/gen-dataset.ts` runs curated multilingual conversations through Mirzo → `eval-data/dataset.json` (output scoring) + `eval-data/dataset.studio.json` (Studio agent-experiment items; `input` is a **bare messages array**, `groundTruth` the expected reply).
- [x] **Headless batch scorer** — `tests/dataset.eval.ts` scores the dataset with faithfulness + answer-relevancy (skips if the dataset file is missing).

**Studio experiment workflow:** `npm run db:reset` → in Studio (localhost:4111) create a dataset, paste each item's `input` array + `groundTruth` → run experiment vs the `mirzo` agent. Reset before each batch so mutating tools (`purchaseAddon`, `changePlan`, `applyDiscount`) don't drift data mid-run. Headless equivalent: `./scripts/eval.sh tests/dataset.eval.ts`.

---

## P1 — Critical (acceptance criteria broken)

### 1. ~~Cancellation "never mind" has no reset path~~ ✓
**Files:** `src/tools/retention.ts`, `src/agents/mirzo.ts`

Added `resolveCancellation(userId)` tool — resets FSM state and closes session as abandoned. Registered in the agent and added system prompt instruction to call it when the user withdraws cancellation intent.

- [x] Expose `resolveCancellation` tool in `src/tools/retention.ts`
- [x] Register tool in `mirzo.ts` and add system prompt instruction
- [x] Add eval: SCEN-04 non-happy path — user says "never mind" → `resolveCancellation` called, no escalation fired

### 4. `kb.retrieve` log missing chunk IDs and scores
**Files:** `src/runtime/context.ts`, `src/tools/common.ts`

Spec (`spec/IMPLEMENTATION.md §Logging`) requires logging query + top-3 chunk IDs + scores on every KB retrieval. Only `{ event: 'kb.retrieve', query }` is logged today.

- [ ] In `safeSearchKB` (`context.ts`), log chunk IDs and scores after a successful retrieval
- [ ] In the `searchKB` tool execute (`tools/common.ts`), log chunk IDs and scores alongside the query

### 5. KB score threshold too high — valid chunks excluded
**File:** `src/kb/retriever.ts`

`minScore: 0.5` was set for pgvector cosine similarity with `nomic-embed-text`. The spec says drop chunks with `score < 0.05` (written for TF-IDF). At 0.5 many relevant chunks are likely excluded, especially for Uzbek/English queries.

- [ ] Run 10 representative queries (from `spec/SCENARIOS.md` demo script) and inspect hit scores
- [ ] Tune `minScore` to the lowest value that still drops clearly irrelevant noise (likely 0.1–0.2)
- [ ] Add a note in `retriever.ts` explaining the chosen threshold and the embedding model it targets

---

## P2 — Important (specified behavior not implemented)

### 6. System prompt missing context-block instructions
**File:** `src/agents/mirzo.ts`

`spec/IMPLEMENTATION.md §System Prompt` includes explicit instructions about `[KB]`, `[Memory]`, `[Session]`, and `[Profile]` blocks. Current instructions mention none of these by name, so the agent doesn't know to look for or prioritise them.

- [ ] Add instruction: read `[Profile]` block — User ID in it is the exact value to pass to all tools
- [ ] Add instruction: read `[Memory]` block before responding; never re-offer discounts in `offersShown`
- [ ] Add instruction: top-3 KB chunks are pre-loaded in `[KB]` — read them before deciding to call a tool
- [ ] Add instruction: `[Session]` block contains current `cancellationState` — follow the FSM strictly

### 7. No proactive low-balance warning instruction
**File:** `src/agents/mirzo.ts`

Spec (`spec/DATA.md §UserPreferences`): if `topupReminderEnabled` is true and `balance < lowBalanceThreshold`, the agent proactively mentions the low balance. The context annotates balance as `(low)` but the system prompt has no instruction to act on it.

- [ ] Add system prompt instruction: when `[Profile]` shows balance as `(low)` and `topupReminderEnabled` is implied, proactively mention it and offer payment methods

### 8. `interactionHistory` on user profile never written
**Files:** `src/memory/longTerm.ts`, `src/data/users.ts`

Schema and seeds define `interactionHistory: InteractionRecord[]` on each user, but `endSession` only writes to `app.long_term_memory`, not the user record.

- [ ] Decide: write `InteractionRecord` to DB user table on session end, or drop the field from the schema/seed as intentionally unused in the prototype
- [ ] If keeping: update `endSession` to append an `InteractionRecord` via `updateUser`

---

## P3 — Eval coverage gaps

### 9. Missing scenario and non-happy-path eval cases
**File:** `tests/scenarios.eval.ts`

- [ ] SCEN-03: assert both `checkOutage` and `runDiagnostic` are called (spec: parallel)
- [ ] SCEN-03 non-happy path: user insists after clean diagnostic → `createTicket` called with category "user-reported, diagnostic clean"
- [ ] SCEN-04: full FSM sequence — reason given → offer presented → offer declined → alternative → escalated
- [x] SCEN-04 non-happy path: user says "never mind" before `ESCALATED` → no escalation, state reset (done — see task 1)
- [ ] SC-02: language switch mid-conversation — send Russian, follow with English, verify reply language changes
- [ ] SC-08: set `responseLength: 'short'` via `updateUserPreferences`, verify subsequent reply is shorter
- [ ] SC-11: simulate a tool returning `{ success: false }` → assert polite apology + `escalateToHuman` called
- [ ] SCEN-01 non-happy path: user disputes invoice amount → `escalateToHuman` eventually called
- [ ] SC-07: policy question (e.g. "how do I pay?") → assert `searchKB` called, no account tool called

### 10. Grounding eval: wire unused scorers
**Files:** `tests/grounding.eval.ts`, `tests/dataset.eval.ts`, `src/mastra/index.ts`

- [x] Answer-relevancy now used in `tests/dataset.eval.ts` (runs over every dataset record alongside faithfulness).
- [ ] **Tone scorer still unused** — its typed signature wants the agent message-array format (`ScorerRunInputForAgent`), not plain `{input, output}` strings, so it was deliberately left out of the batch scorer. Either feed it agent-shaped input or remove it from `src/mastra/index.ts`.

### 11. `runtime.test.ts` missing unit coverage
**File:** `tests/runtime.test.ts`

- [ ] `/end` command — verify session closed (`endSession` called), goodbye returned in user's language
- [ ] `/start` for a known user — verify `endSession` called, `welcomeBack` returned (not the full greeting)
- [ ] Non-text message for an already-identified user — verify no state mutation

---

## P4 — Minor / structural

### 12. `turn.start` log missing `chatId` / `userId`
**File:** `src/runtime/runtime.ts`

Spec log schema (`spec/IMPLEMENTATION.md §Logging`) includes `chatId: number` and optional `userId`. Current `turn.start` log only emits `conversationId` and `channel`.

- [ ] Pass `chatId` (derivable from `conversationId` for Telegram) and `userId` (once resolved) into the `turn.start` / `turn.end` log events

### 13. Verify persona #8 not accidentally seeded in `channel_identities`
**File:** `src/db/init.ts`

`init.ts` seeds `channel_identities` for personas 1–7. Persona #8 ("new user, no profile") must remain unseeded to exercise SCEN-00.

- [ ] Confirm `initDb` does not insert a `channel_identities` row for `telegramId` corresponding to persona #8
- [ ] Add a comment in `init.ts` explaining why persona #8 is intentionally absent

### 14. Unused `tone` scorer in `mastra/index.ts`
**File:** `src/mastra/index.ts`

`answer-relevancy` is now exercised by `tests/dataset.eval.ts`. Only `tone` remains unused (see task 10 — it needs agent-shaped input).

- [ ] Wire `tone` into a test with agent-shaped input, or remove it from `mastra/index.ts` to reduce dead code
