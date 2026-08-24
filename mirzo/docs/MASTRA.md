# Mastra — build reference

Pulled from mastra.ai docs and cross-checked against the published `.d.ts` on
2026-08-23–25 (some doc pages disagree with the actual types — where they
conflicted, the type declaration won). Versions pinned at fetch time:
`@mastra/core@1.61.0`, `@mastra/memory@1.27.0`, `@mastra/pg@1.21.1`,
`@mastra/evals@1.9.0`. The first three require **Node ≥22.13.0** (matches the
`node:22-alpine` base in SPEC.md §13). Mastra ships frequently — re-check
`npm view @mastra/core versions` before trusting anything below if much time
has passed.

Scoped to what SPEC.md needs to build. Not a full API dump.

---

## 1. Packages

| Package | Role |
|---|---|
| `@mastra/core` | `Agent`, `createTool`, `Mastra` registry, Skills, `RequestContext`, `runEvals` |
| `@mastra/memory` | `Memory` class — thread/resource conversation history |
| `@mastra/pg` | `PostgresStore` — persistence backing `Memory` |
| `@mastra/evals` | Quick Checks (`checks.*`, §6) — dev dependency only, not needed at runtime |
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

- `execute(input, ctx)` — `ctx.requestContext` is a real `RequestContext`
  instance (`@mastra/core/request-context`, confirmed via its `.d.ts` —
  `.get(key)` / `.set(key, value)` / `.has(key)`, constructed with
  `new RequestContext(entries)` from an iterable of `[key, value]` pairs).
  Carries whatever the caller set on the agent call (session `customerId`,
  language). `ctx.abortSignal` is separate, for cancellation.
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

Two complementary deterministic mechanisms, both zero-LLM:

**Quick Checks** (`@mastra/evals/checks`, confirmed via `.d.ts` — some doc
pages showed the import as `@mastra/evals`, but the package's root export is
empty; the real subpath is `/checks`) are pre-built micro-scorers for the
most common tool-trajectory and text assertions. Internally each one is a
`createScorer()` instance, so it composes with everything else scorers do:

```ts
import { checks } from '@mastra/evals/checks';

checks.includes('sunny');            // output text contains substring
checks.excludes('error');
checks.matches(/\d{1,3}°[FC]/);      // regex match
checks.calledTool('changePlan');     // tool called ≥1 time (accepts { times })
checks.didNotCall('applyCredit');    // tool never called
checks.toolOrder(['a', 'b']);        // relaxed ordering
checks.usedNoTools();
checks.noToolErrors();
```

There is no built-in "at most N calls" check — `calledTool`'s `times` option
is a lower bound only.

**`runEvals`** (`@mastra/core/evals`) runs `data` items against a `target`
agent (or workflow) and reports a pass/fail `verdict` when you pass `gates` —
scorers that must all score `1.0` for the run to pass:

```ts
import { runEvals } from '@mastra/core/evals';
import { checks } from '@mastra/evals/checks';
import { createRequestContext } from '../agent/requestContext.js';

const result = await runEvals({
  target: mirzo,
  data: [{ input: 'Fake confirmation text, no token', requestContext: createRequestContext({ customerId }) }],
  gates: [checks.usedNoTools()],
});

result.verdict; // 'passed' | 'scored' | 'failed'
```

- `requestContext` is set **per data item** (`RunEvalsDataItemBase.requestContext`),
  not via `targetOptions` — `runEvals`'s agent-options type explicitly omits
  `requestContext` there.
- `runEvals` injects a fresh thread per `data` item automatically — this
  already satisfies §10.1's "unique userId per case" without extra plumbing.
- Custom `createScorer()` scorers (chained `.preprocess()/.analyze()/.generateScore()/.generateReason()`,
  no judge config) still work as `gates` or `scorers` entries side by side
  with Quick Checks, for assertions Quick Checks don't cover (e.g. "at most
  N calls" — case 17 in the eval suite).

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

## 8. Telegram — the `channels` config on Agent, not a hand-built `Chat`

**Corrected from an earlier version of this doc**, which wired
`@chat-adapter/telegram` through a manually-constructed `Chat` instance
imported from `@chat-adapter/core`. That package doesn't exist —
`ERR_MODULE_NOT_FOUND` on first real boot. The actual underlying package
(`@chat-adapter/telegram`'s own dependency) is named plain **`chat`**, not
`@chat-adapter/core` — but the right fix isn't importing that either: Mastra
has a native `channels` config directly on `Agent`, and that's what should be
used. Confirmed real (`@chat-adapter/telegram@4.38.1` exists on npm and is
Agent-`channels`-compatible), but the `channels` config shape itself is
sourced from docs, not a published `.d.ts` — treat it as one notch less
certain than the rest of this file.

```ts
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { Agent } from '@mastra/core/agent';

export const mirzo = new Agent({
  // ...id, instructions, model, tools, skills, memory...
  channels: {
    adapters: {
      telegram: createTelegramAdapter({
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        mode: 'polling', // dev: no public URL needed. 'webhook' for the deployed instance.
      }),
    },
    handlers: {
      onDirectMessage: async (thread, message, defaultHandler, ctx) => {
        // ctx: { mastra?, requestContext: RequestContext } — see §5's real class
        // message.author.userId identifies the Telegram user
        // thread.startTyping() / thread.post(msg) — same Chat SDK Thread primitives
      },
    },
  },
});
```

- **Channels require Mastra's own HTTP server to receive traffic** — webhook
  mode registers `/api/agents/<id>/channels/telegram/webhook` on it; polling
  mode still needs the Mastra server process running to activate the poll
  loop. This is not optional plumbing you can skip by writing your own
  process — `mastra dev` (dev) or a deployed Mastra server (prod) *is* the
  thing that talks to Telegram. `src/index.ts` in this project only owns the
  admin panel; the agent's `channels` config is what the Telegram side runs on.
- `onDirectMessage` receives `(thread, message, defaultHandler, ctx)`. Calling
  `defaultHandler(thread, message)` runs Mastra's own generate-and-reply
  pipeline for that one message. **This project never calls it** — SPEC
  §14.3's debounce means most incoming messages must produce *no* reply at
  all (buffered into the next one), which a one-message-in-one-reply-out
  default can't express. Instead, the handler buffers, and on flush calls
  `agent.generate()` and `thread.post()` itself (project code:
  `src/telegram/handlers.ts`).
- `ctx.requestContext` is the same real `RequestContext` class as §5 —
  already provided by the framework per-message; write session values onto
  it with `.set()` before use, don't construct a new one.
- `thread.startTyping()` / `thread.post(message)` are still the Chat SDK
  `Thread` primitives (§14.4's first-line-of-handler and paragraph-bubble
  logic still applies) — the adapter's own `typingStatus` config option only
  fires inside the default streaming pipeline, which this project bypasses.
- The Bot API has no incoming "user is typing" update at all (bots can only
  *send* `sendChatAction`, never receive it) — this is why SPEC §14.3
  debounces on a fixed timer instead of watching for the user to stop typing.

---

## 9. Mastra registry + dev server

```ts
// src/mastra/index.ts — the conventional location the `mastra` CLI looks for
import { Mastra } from '@mastra/core';
import { mirzo } from '../agent/mirzo.js';
import { store } from '../agent/memory.js';

export const mastra = new Mastra({
  agents: { mirzo },
  storage: store, // same PostgresStore instance as §5, or a second one
});
```

- `mastra dev` starts **Studio** (a local playground/inspector UI, on
  `localhost:4111` by default) **and** the HTTP server that Telegram channel
  traffic actually needs (§8) — for this project it is not optional, unlike
  the "just a dev convenience" framing that might otherwise apply.
- `package.json`'s `dev` script runs it alongside the project's own process:
  `"mastra dev & tsx watch src/index.ts"` — two processes, one for the
  agent/Telegram/Studio server, one for the admin panel.
- SPEC.md §11's admin panel (`localhost:3001`) is unrelated to Studio — it's a
  project-owned Hono page reading `audit_log` / `pending_actions` / customer
  tables directly, not a Mastra feature.
