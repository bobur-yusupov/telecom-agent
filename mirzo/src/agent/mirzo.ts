import { join } from 'node:path';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { Agent } from '@mastra/core/agent';
import { handleTelegramMessage } from '../telegram/handlers.js';
import { tools } from '../tools/index.js';
import { memory } from './memory.js';
import { buildSystemPrompt, type PromptRequestContext } from './systemPrompt.js';

// Absolute, not relative: `mastra dev` spawns the actual server with its cwd
// set to `.mastra/output/public`, not the project root (confirmed by
// inspecting the running process's env — `MASTRA_PROJECT_ROOT` is also *not*
// the project root, it points one level too shallow, at `.mastra`), and the
// dev/build bundle flattens this file into `.mastra/output/`, so even a path
// built from this file's own location wouldn't reach `src/`. `INIT_CWD` is
// npm's own "directory `npm run` was invoked from" — set once by the
// top-level `npm run dev`/`npm run eval` and inherited by every process it
// spawns — which is what actually stays put at the project root.
const projectRoot = process.env.INIT_CWD ?? process.cwd();
const skillsDir = join(projectRoot, 'src', 'skills');

export const mirzo = new Agent({
  id: 'mirzo',
  name: 'Mirzo',
  description: 'NovaTel customer service agent — billing, plan changes, technical support, cancellations.',
  instructions: ({ requestContext }: { requestContext?: PromptRequestContext }) => buildSystemPrompt(requestContext),
  model: 'deepseek/deepseek-chat',
  tools,
  skills: [
    join(skillsDir, 'billing-dispute-resolution'),
    join(skillsDir, 'plan-change-eligibility'),
    join(skillsDir, 'retention-playbook'),
  ],
  memory,
  // SPEC.md §14, MASTRA.md §8 — native channel, not a hand-rolled Chat SDK
  // wiring. Requires `mastra dev` (or a deployed Mastra server) to actually
  // receive traffic — see src/mastra/index.ts. This config shape is
  // confirmed via docs, not a published .d.ts (unlike most of this file's
  // other imports) — the `as any` reflects that, not carelessness.
  channels: {
    adapters: {
      telegram: createTelegramAdapter({
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        mode: process.env.TELEGRAM_MODE === 'webhook' ? 'webhook' : 'polling',
      }),
    },
    handlers: {
      // never calls the framework's defaultHandler — see handlers.ts for why
      onDirectMessage: async (thread: any, message: any, _defaultHandler: any, ctx: { requestContext: any }) => {
        await handleTelegramMessage(mirzo, thread, message, ctx.requestContext);
      },
    },
  } as any,
});
