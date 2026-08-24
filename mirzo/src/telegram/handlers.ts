import type { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import { bufferMessage } from './debounce.js';
import { resolveSession } from './identity.js';
import { sendPacedReply, type ReplyThread } from './reply.js';

interface ChannelMessage {
  text?: string;
  author?: { userId?: string };
}

// SPEC.md §14 — wired as the `channels.handlers.onDirectMessage` callback on
// the agent (agent/mirzo.ts). Deliberately never calls Mastra's own
// `defaultHandler`: §14.3's debounce means most incoming messages must
// produce *no* reply at all (they're buffered into the next one), which the
// framework's default one-message-in-one-reply-out handler can't express.
//
// Takes `agent` as a parameter rather than importing `mirzo` directly, to
// avoid a circular import (mirzo.ts → handlers.ts → mirzo.ts).
export async function handleTelegramMessage(
  agent: Agent,
  thread: ReplyThread & { id: string },
  message: ChannelMessage,
  requestContext: RequestContext,
): Promise<void> {
  const telegramUserId = String(message.author?.userId ?? thread.id);

  // §14.4 step 1 — signal typing immediately, before buffering or any model work
  await thread.startTyping();

  bufferMessage(telegramUserId, message.text ?? '', async (joinedText) => {
    const session = await resolveSession(telegramUserId);
    requestContext.set('customerId', session.customerId as never);
    requestContext.set('telegramUserId', telegramUserId as never);
    requestContext.set('language', session.language as never);

    const result = await agent.generate(joinedText, {
      memory: { thread: telegramUserId, resource: session.customerId ?? telegramUserId },
      requestContext,
    } as never);

    await sendPacedReply(thread, (result as { text: string }).text);
  });
}
