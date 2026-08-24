# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This directory (`mirzo/`) is in the design phase: `docs/SPEC.md` is the only
content, and it is the authoritative architecture document — nothing has been
scaffolded or implemented yet, including Docker (§13 is a design for a coding
agent to build, not a description of files that exist). A prior implementation of
the same product lives at `../legacy/` (sibling directory, same git repo) — same
core stack (TypeScript, Mastra, Postgres, Drizzle, Zod) but built on telegraf.js
and lacking the confirmation-guard architecture described below. Do not copy code from
`../legacy/` without adapting it to the guard/sensor pattern; it predates the
current design thesis.

## What Mirzo is

A Telegram customer-service agent for NovaTel, a Tajikistan telecom operator.
Handles billing, plan changes, technical support, and cancellations in Uzbek and
English.

## Design thesis (non-negotiable)

Authorization for destructive actions belongs in code, inside `tool.execute()`,
not in the system prompt. A model can be talked into believing a user confirmed
something; a database constraint cannot. Concretely:

1. Guards are wrappers. Tool authors write business logic only.
2. Tools never throw into the model. Failures return `{ ok: false, code, message }`.
3. The model is untrusted input — arguments are validated at the tool boundary.
4. Every mutation produces an audit row. No write path bypasses the log.
5. A successful commit is not proof of effect — it must be verified by a sensor.
6. The action space is bounded: every tool has a fixed signature and fixed effect.
7. State lives in Postgres only. No in-memory data layer.

## Architecture layers

| Layer            | Responsibility                            |
|-------------------|-------------------------------------------|
| Telegram adapter  | Message in/out, session identity (Mastra's native Telegram channel, `@chat-adapter/telegram`) |
| Agent             | Model (DeepSeek), system prompt, on-demand skill loading (Mastra) |
| Tool layer        | Zod contracts, guard wrapper, sensors     |
| Data layer        | Drizzle ORM over Postgres                 |
| Admin panel       | Read-only observability (Hono + single HTML page, 2s polling) |

Stack: TypeScript, Mastra (agent framework + Memory over PostgresStore),
DeepSeek (`deepseek-chat`, via Mastra's model router), PostgreSQL, Drizzle, Zod,
`@chat-adapter/telegram`, Hono.

**Before writing any Mastra code** (agent, tools, memory, skills, evals,
Telegram), read `docs/MASTRA.md` — a build reference pulled from mastra.ai and
the published package types on 2026-08-23, pinned to `@mastra/core@1.61.0`. It
corrects one thing this file and SPEC.md previously assumed: skills should use
Mastra's native Skills system, not a hand-rolled loader. It also documents the
real `@chat-adapter/telegram` API (`thread.startTyping()`, `thread.post()`,
polling vs webhook) that SPEC.md §14's Telegram behavior design is built on.

## The confirmation guard (core mechanism)

This is the mechanism the whole system is built around — implement it before
building individual tools.

- **Call without a token**: guard validates schema, runs `preconditions`, and if
  they pass writes a `pending_actions` row (fresh UUID token, 120s expiry), audits
  `proposed`, and returns the token + a localized human-readable summary. Nothing
  is mutated. If preconditions fail, it's a rejection *before* any token exists —
  the agent can never get confirmation for an action that would fail anyway.
- **Call with a token**: guard validates, in order (any failure audits `rejected`,
  mutates nothing): token present (`MISSING_TOKEN`) → token exists (`INVALID_TOKEN`)
  → not yet consumed (`TOKEN_ALREADY_USED`) → not expired (`TOKEN_EXPIRED`) →
  `args_hash` matches this call (`ARGS_MISMATCH`) → `customer_id` matches session
  (`CUSTOMER_MISMATCH`).
- **Mutation**: one transaction — consume token, run `commit`, write `committed`
  audit row, store idempotency key. Transaction is the rollback boundary.
- **Verification**: after commit, the tool's declared `sensor` re-checks reality
  independently. Pass → audit `verified`, return `{ ok: true, verified: true, result }`.
  Fail → audit `verify_failed`, open an `authorization` ticket, return
  `{ ok: false, code: 'VERIFY_FAILED' }`. **The agent may only report success when
  `verified: true`** — enforced by the return contract, not by prompting.

Guarded tools are defined declaratively; token handling, auditing, idempotency, and
verification are inherited from the wrapper:

```ts
export const changePlan = createGuardedTool({
  name: 'changePlan',
  schema: z.object({ customerId: z.string().uuid(), targetPlanCode: z.string() }),
  preconditions: async (args, ctx) => { /* eligibility */ },
  summarize:     (args, ctx) => { /* localised text */ },
  commit:        async (args, ctx, tx) => { /* the mutation */ },
  sensor:        sensors.subscriptionMatchesPlan,
});
```

A new guarded tool should take under ~20 lines given the guard is inherited.

## Sensors

Each guarded tool declares one sensor that independently re-queries state after
`commit` — it never trusts the transaction's own return value:
`subscriptionMatchesPlan` (`changePlan`), `creditApplied` (`applyCredit`),
`addonActive` (`purchaseAddon`), `escalationTicketOpen` (`requestCancellation`).
See `docs/SPEC.md` §7.

## Tools

- **10 read tools** (no guard, write a `read` audit row): `lookupCustomer`,
  `getBalance`, `getCurrentPlan`, `getUsage`, `listPlans`, `getInvoice`,
  `listAddons`, `checkNetworkStatus`, `getTransactionHistory`, `compareInvoices`.
- **4 guarded write tools**: `changePlan` (downgrade blocked if
  `changes_this_cycle >= 1`; upgrade sets `plan_id` immediately, downgrade sets
  `pending_plan_id` for cycle-end), `applyCredit` (≤50 TJS/credit, ≤100
  TJS/customer/30d, must reference an existing transaction), `purchaseAddon`
  (active add-on, sufficient balance, no active `customer_addons` row already),
  `requestCancellation` (rejects `RETENTION_REQUIRED` unless
  `retention_attempted = true`; never cancels the subscription itself — opens a
  `retention`-category ticket for a human agent).
- **3 unguarded write tools**: `createTicket`, `setRetentionAttempted` (sets the
  flag `requestCancellation` reads — this is how the retention ladder is enforced
  in code rather than by prompt compliance), `linkCustomer` (persists
  `telegram_user_id` → `customer_id` in `telegram_links`, §4.12 — see "Telegram
  behavior" below).

## Skills (loaded on demand, `SKILL.md` per skill)

Names/descriptions must be tight enough that the wrong skill never gets selected.

- **`billing-dispute-resolution`** — mandatory diagnostic order: compare current
  vs prior invoice → mid-cycle add-ons → overage/roaming → proration from a plan
  change. Never propose a credit without naming the specific line item and amount.
  Requires `getInvoice` + `compareInvoices` before any credit decision.
- **`plan-change-eligibility`** — recommendation derived from `getUsage`, never
  from the customer's own estimate: >85% allowance → propose tier up; <40% →
  propose tier down; otherwise no change, stated plainly. Requires `getUsage`,
  `getCurrentPlan`, `listPlans` first.
- **`retention-playbook`** — one rung of the ladder per turn: (1) diagnose reason,
  offer nothing yet; (2) address the actual complaint (billing → billing skill,
  coverage → `checkNetworkStatus`, price → step 3); (3) offer a discount on
  current plan (calls `setRetentionAttempted`); (4) offer a downgrade or free
  add-on instead of cancelling; (5) if the customer still wants to leave, give one
  closing recommendation then call `requestCancellation` — this opens a human
  escalation ticket, the bot never cancels the subscription itself. Never stack
  offers, never invent an offer.

Language register (tone, formality) stays in the system prompt, not a skill — it
applies every turn, so on-demand loading is the wrong mechanism for it.

## System prompt block order

Constraints first, tone last: (1) Constraints — scope boundaries, never claim
success without `verified: true`, never invent balances/prices/policy, destructive
actions always require a token; (2) Identity; (3) Operating rules — tool
selection, skill triggers, escalation, confirmation presentation format; (4) Tone.

## Data model

Key tables (see `docs/SPEC.md` §4 for full column lists): `customers`, `plans`,
`subscriptions` (tracks `pending_plan_id`, `changes_this_cycle`,
`retention_attempted`), `addons` + `customer_addons` (catalog and per-customer
activation, backing `listAddons`/`purchaseAddon`), `usage`, `transactions`,
`outages` (backs `checkNetworkStatus`), `pending_actions` (the guard's backing
store — token, args_hash, expires_at, consumed_at), `audit_log` (append-only, no
UPDATE/DELETE grants; outcome ∈
`read | proposed | committed | verified | rejected | verify_failed`), `tickets`,
`idempotency_keys`, `telegram_links` (`telegram_user_id` → `customer_id`,
populated by `linkCustomer`, §14.6).

## Evaluation

Deliberately narrow for the prototype: six checks against real agent
behavior (`npm run eval`), each a native Mastra Quick Check
(`@mastra/evals/checks`) used as a `runEvals` gate — zero-LLM, asserts on
tool-call trajectory or output text, never a second model grading the reply.
Covers scope refusal, usage-based plan recommendations (both directions),
never-crediting an unproven dispute, not jumping straight to cancellation,
and Uzbek language mirroring (Spec §10.2). Each check gets its own throwaway
customer. The guard's own token mechanics (§6.3) are *not* covered by this
suite — that correctness is structural (`createGuardedTool`, §6), verified
manually via `mastra dev` / the admin panel for now, not by an automated check.

## Admin panel

Single read-only page at `localhost:3001`, 2s polling, no auth: live audit log
tail (color-coded by outcome), pending tokens with TTL countdown, customer state
(balance/plan/subscription status).

## Docker

`docker compose up --build` once, then `docker compose up` — the `app` service
bind-mounts the repo and runs `tsx watch`, so source edits restart the process in
place with no manual stop/rerun. Rebuild only when `package.json` changes. Full
design (Dockerfile stages, hot-reload mechanics, env handling) in `docs/SPEC.md` §13.

## Telegram behavior

The bot paces replies like a person, not a document dump: signals typing
immediately, replies in up to 3 short bubbles split on paragraph breaks with a
brief re-signaled-typing pause between them, and debounces incoming message
bursts (default 2s, 8s ceiling) into one agent turn before calling `mirzo`.
This exists because **Telegram's Bot API has no incoming "user is typing"
signal at all** — `sendChatAction` is send-only, bot → user — so batching runs
on a fixed timer, not a stop-typing event. The debounce buffer is
per-thread/in-memory, a deliberate narrow exception to the "state lives in
Postgres" principle above (ephemeral, self-healing on restart). Session
identity is the opposite case — real state, persisted: the adapter resolves
`telegram_user_id` → `customer_id` from `telegram_links` before invoking the
agent; if unresolved, the agent asks for a phone number and calls
`lookupCustomer` then `linkCustomer` before any other tool. Full design in
`docs/SPEC.md` §14; the underlying adapter calls (`thread.startTyping()`,
`thread.post()`) are in `docs/MASTRA.md` §8.

## Seed data

Three demo customers, each anchoring one scenario: Dilnoza (disputed bill, mystery
mid-cycle add-on → billing skill), Farrukh (94% data usage, tier 2 → upgrade path
and confirmation-attack target), Rustam (26-month tenure, cancellation intent,
competitor mention → retention ladder). `npm run reset` truncates transactional
tables and re-seeds; must be safe to run mid-demo.
