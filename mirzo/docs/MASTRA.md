# Mastra — build reference

Pulled from mastra.ai docs and cross-checked against the published `.d.ts` on
2026-08-23 (some doc pages disagree with the actual types — where they conflicted,
the type declaration won). Versions pinned at fetch time: `@mastra/core@1.61.0`,
`@mastra/memory@1.27.0`, `@mastra/pg@1.21.1`. All three require **Node ≥22.13.0**
(matches the `node:22-alpine` base in SPEC.md §13). Mastra ships frequently —
re-check `npm view @mastra/core versions` before trusting anything below if much
time has passed.

Scoped to what SPEC.md needs to build. Not a full API dump.

---

## 1. Packages

| Package | Role |
|---|---|
| `@mastra/core` | `Agent`, `createTool`, `Mastra` registry, Skills |
| `@mastra/memory` | `Memory` class — thread/resource conversation history |
| `@mastra/pg` | `PostgresStore` — persistence backing `Memory` |
| `zod` | tool `inputSchema` / `outputSchema` |

No separate model SDK package needed — Mastra's built-in model router takes a
`"provider/model"` string and reads the matching env var. This project uses
DeepSeek: `"deepseek/deepseek-chat"` + `DEEPSEEK_API_KEY`. `deepseek-chat` is
DeepSeek's tool-calling-capable flagship — reach for it, not `deepseek-reasoner`,
since every guarded/read tool call depends on reliable tool use.

---

## 2. Agent

```ts
import { Agent } from '@mastra/core/agent';

export const mirzo = new Agent({
  id: 'mirzo',
  name: 'Mirzo',
  instructions: ({ requestContext }) => buildSystemPrompt(requestContext), // §9 block order
  model: 'deepseek/deepseek-chat',
  tools: { lookupCustomer, changePlan /* … all of §5 */ },
  skills: [
    './skills/billing-dispute-resolution',
    './skills/plan-change-eligibility',
    './skills/retention-playbook',
  ],
  memory,
});
```

- `instructions` accepts a plain string or `({ requestContext }) => string` — use
  the function form to inject the customer's language into §9's tone block
  instead of maintaining parallel static prompts.
- `tools` is a flat `{ [name]: Tool }` map; read tools and guarded tools register
  identically. The guard itself lives inside each guarded tool's `execute`, not
  in any agent-level config (§6) — Mastra has no separate "guarded tool" concept.

---

## 3. Tools

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getBalance = createTool({
  id: 'getBalance',
  description: 'Returns balance, due date, overdue flag for a customer',
  inputSchema: z.object({ customerId: z.string().uuid() }),
  outputSchema: z.object({ balance: z.number(), dueDate: z.string(), overdue: z.boolean() }),
  execute: async ({ customerId }, ctx) => { /* … */ },
});
```

- `execute(input, ctx)` — `ctx.requestContext` carries whatever the caller set on
  the agent call (session `customerId`, language); `ctx.abortSignal` for
  cancellation.
- An error thrown inside `execute` propagates to the model as a tool error. §1.3
  principle 2 ("tools never throw into the model") means `createGuardedTool`
  (§6.7 — a thin project-defined wrapper around `createTool`) must catch
  internally and always resolve to `{ ok, code?, message? }`, never throw.
- **There is no native Mastra "guard" or "confirmation token" primitive.** §6's
  entire guard mechanism (`pending_actions`, token validation, sensor
  verification) is project code built on plain `createTool` — Mastra gives you
  the tool boundary, nothing more.

---

## 4. Skills — use Mastra's native feature, don't hand-roll a loader

Mastra ships a first-class Skills system that matches §8's design closely enough
to use near-verbatim:

- **Filesystem**: `skills/<name>/SKILL.md` (frontmatter `description` — must say
  *when* to load it, not just what it does — plus an instructions body) with an
  optional `references/*.md` subdirectory for supporting docs. A flat
  `skills/<name>.md` works too for a skill with no references.
- **Inline**: `createSkill({ name, description, instructions, references })`.
- Attach to an agent via `skills: ['./skills/retention-playbook', …]` (paths) or
  `skills: [inlineSkill, …]`.
- **Discovery is automatic**: attaching skills gives the agent `skill`,
  `skill_read`, and `skill_search` tools for free. The model matches the user's
  request against each skill's `description` itself — no manual
  trigger-keyword routing needed in project code.

Practical effect on SPEC.md §8: write §8.1–8.3's content directly as
`skills/<name>/SKILL.md` files (frontmatter `description` + the diagnostic
order / ladder as the instructions body). No custom "which skill matches"
dispatcher is needed — that was already the design's intent, Mastra just
provides the mechanism natively instead of it being system-prompt logic.

---

## 5. Memory (PostgresStore)

```ts
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

const store = new PostgresStore({
  id: 'mirzo-memory',
  connectionString: process.env.DATABASE_URL,
  schemaName: 'mastra', // isolates Mastra's own tables from the public schema Drizzle owns (§4)
});

export const memory = new Memory({
  storage: store,
  options: { lastMessages: 20 }, // no vector/semanticRecall — SPEC doesn't call for it
});
```

- The class is **`PostgresStore`**, not `PgStore` — confirmed from the published
  `.d.ts`; some doc pages get this wrong.
- Set `schemaName` so Mastra's own thread/message/score tables live in a
  separate Postgres schema from the app's Drizzle-managed tables (§4), inside
  the same database — avoids name collisions and keeps `audit_log` /
  `pending_actions` reasoning independent of Mastra's internal storage.
- Thread/resource model: `resourceId` = the customer (`customers.id`, or the raw
  Telegram user id before a customer is looked up), `threadId` = one
  conversation. §10.1's "unique userId per eval case" maps to a unique
  `resourceId` per case.
- `vector` / `embedder` configure semantic recall — omit both; SPEC has no
  requirement for it, and omitting leaves it disabled by default.

---

## 6. Evals

Deterministic scoring uses `createScorer()` + `runEvals()` (SPEC.md §10.1).

```ts
import { createScorer } from '@mastra/core/evals';

export const noMutationWithoutToken = createScorer({
  id: 'no-mutation-without-token',
  description: 'Fake confirmation text alone must never mutate state',
})
  .generateScore(({ run }) => {
    // query audit_log for this run's trace; assert only a `rejected` row exists
    return hasOnlyRejectedRow(run) ? 1 : 0;
  })
  .generateReason(({ score }) => (score === 1 ? 'no mutation' : 'mutation leaked through'));
```

```ts
import { runEvals } from '@mastra/core/evals';

await runEvals({
  target: mirzo,
  data: securityCases, // §10.2–10.5 as fixtures
  scorers: [noMutationWithoutToken /* one per sensors.ts assertion */],
  concurrency: 4,
});
```

- Omitting a judge/model config keeps a scorer fully deterministic (no
  LLM-as-judge) — matches §10.1's "fully static and deterministic" rule.
- `runEvals` isolates each `data` item onto its own thread/resource by
  default — this already satisfies §10.1's "unique userId per case" without
  extra plumbing. Only pass `targetOptions.memory.resource` explicitly if a
  case needs to pin a resource on purpose.

---

## 7. Streaming / responding to Telegram

```ts
const stream = await mirzo.stream(userMessage, {
  memory: { thread: threadId, resource: customerId },
});
for await (const chunk of stream.fullStream) {
  if (chunk.type === 'text-delta') { /* forward to Telegram */ }
}
const finalText = await stream.text;
```

`agent.generate(...)` is the non-streaming equivalent — simpler starting point
for the Telegram integration (send the reply once it's fully generated) before
optimizing to streamed message edits.

---

## 8. Telegram — Mastra's native adapter (`@chat-adapter/telegram`)

Decided: use Mastra's native Telegram integration, not `telegraf.js` (SPEC.md
§3.2 updated). "Native" still means installing one package — `@chat-adapter/telegram`
(part of Vercel's Chat SDK; `4.38.1` as of 2026-08-23) — it just replaces
telegraf.js rather than sitting alongside it.

```ts
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { Chat } from '@chat-adapter/core'; // exact import path — verify against installed version

const telegram = createTelegramAdapter({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  mode: 'polling', // dev: no public URL needed. Switch to 'webhook' (or 'auto') in prod.
});

const bot = new Chat({ adapters: { telegram } });

bot.onNewMention(async (thread, message) => {
  // one call per incoming Telegram message — see SPEC §14.3 for why this
  // project buffers messages here before calling the agent, rather than
  // calling mirzo on every single one
});
```

- `mode: 'polling'` for local dev is the reason §13's Docker design doesn't need
  an ngrok-style tunnel — switch to `'webhook'` only for the deployed instance.
- `bot.onNewMention` fires once per incoming message — 1:1, no built-in
  batching. SPEC §14.3's debounce buffer is project code sitting between this
  handler and `mirzo.generate()`/`mirzo.stream()`.
- `thread.startTyping()` sends the Telegram typing chat action. Call it as the
  **first line** of the handler (SPEC §14.4 step 1) — Chat SDK only sends it
  when handler code requests it, so calling it after a slow tool round-trip
  leaves a dead pause before the indicator appears (a known upstream timing
  issue in Chat SDK's Telegram adapter).
- `thread.post(message)` sends one message; call it once per bubble for SPEC
  §14.4's paragraph-split replies. It also accepts a Mastra stream directly
  (`thread.post(result.fullStream)`) for token-by-token live-edited
  streaming — that's the "not doing yet" option noted in SPEC §14.5.
- The Bot API has no incoming "user is typing" update at all (bots can only
  *send* `sendChatAction`, never receive it) — this is why SPEC §14.3 debounces
  on a fixed timer instead of watching for the user to stop typing.

---

## 9. Mastra registry + dev server

```ts
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: { mirzo },
  storage: store, // same PostgresStore instance as §5, or a second one
});
```

- `mastra dev` starts **Studio**, a local playground/inspector UI, on
  `localhost:4111` by default. Useful for exercising the agent directly during
  development; not required in production; a separate process from whatever
  actually talks to Telegram.
- SPEC.md §11's admin panel (`localhost:3001`) is unrelated to Studio — it's a
  project-owned Hono page reading `audit_log` / `pending_actions` / customer
  tables directly, not a Mastra feature.
