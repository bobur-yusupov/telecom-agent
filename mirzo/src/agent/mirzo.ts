import { createTelegramAdapter } from '@chat-adapter/telegram';
import { Agent } from '@mastra/core/agent';
import { handleTelegramMessage } from '../telegram/handlers.js';
import { tools } from '../tools/index.js';
import { memory } from './memory.js';
import { buildSystemPrompt, type PromptRequestContext } from './systemPrompt.js';

export const mirzo = new Agent({
  id: 'mirzo',
  name: 'Mirzo',
  description: 'NovaTel customer service agent — billing, plan changes, technical support, cancellations.',
  instructions: ({ requestContext }: { requestContext?: PromptRequestContext }) => buildSystemPrompt(requestContext),
  model: 'deepseek/deepseek-chat',
  tools,
  skills: [
    './src/skills/billing-dispute-resolution',
    './src/skills/plan-change-eligibility',
    './src/skills/retention-playbook',
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
