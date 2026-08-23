import crypto from 'node:crypto';
import { createTelegramAdapter } from '@chat-adapter/telegram';
// NOTE: `Chat` import path is unverified against the installed version — see
// MASTRA.md §8. Adjust if the package exports it differently.
import { Chat } from '@chat-adapter/core';
import { mirzo } from '../agent/mirzo.js';
import { createRequestContext } from '../agent/requestContext.js';
import { bufferMessage } from './debounce.js';
import { resolveSession } from './identity.js';
import { sendPacedReply, type ReplyThread } from './reply.js';

const telegram = createTelegramAdapter({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  // SPEC.md §14, MASTRA.md §8 — polling needs no public URL for local dev;
  // switch to webhook for the deployed instance.
  mode: process.env.TELEGRAM_MODE === 'webhook' ? 'webhook' : 'polling',
});

export const bot = new Chat({ adapters: { telegram } });

bot.onNewMention(async (thread: ReplyThread & { id: string }, message: { text?: string; from?: { id: string | number } }) => {
  const telegramUserId = String(message.from?.id ?? thread.id);

  // §14.4 step 1 — signal typing immediately, before buffering or any model work
  await thread.startTyping();

  bufferMessage(telegramUserId, message.text ?? '', async (joinedText) => {
    const session = await resolveSession(telegramUserId);
    const requestContext = createRequestContext({
      customerId: session.customerId,
      telegramUserId,
      traceId: crypto.randomUUID(),
      language: session.language,
    });

    const result = await mirzo.generate(joinedText, {
      memory: { thread: telegramUserId, resource: telegramUserId },
      requestContext,
    } as never);

    await sendPacedReply(thread, result.text);
  });
});
