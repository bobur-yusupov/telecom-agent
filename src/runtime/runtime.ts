import { mirzo } from '../agents/mirzo.js'
import { getUserById, type UserProfile } from '../data/users.js'
import { endSession } from '../memory/longTerm.js'
import { logger } from '../utils/logger.js'
import { resolveUserId } from './identity.js'
import {
  handleOnboardingReply,
  isOnboarding,
  startOnboarding,
  welcomeBack,
} from './onboarding.js'
import { buildContextMessages } from './context.js'
import type { ChannelContext, InboundMessage, OutboundMessage } from './types.js'

/**
 * Channel-agnostic agent runtime. A channel adapter turns its platform events
 * into {@link InboundMessage}s and calls {@link handleTurn}; the runtime owns
 * identity resolution, SCEN-00 onboarding, the per-conversation mutex, session
 * lifecycle, and invoking the Mirzo agent. Nothing here knows about Telegram.
 */

const NON_TEXT_REPLY = 'I can only read text messages right now.'
const BUSY_REPLY = 'One moment please — I am still working on your previous message.'
const MAX_QUEUE = 3

type Lang = UserProfile['language']

const GOODBYE: Record<Lang, string> = {
  tj: 'Ташаккур, ки ба NovaTel муроҷиат кардед. Рӯзи хуш!',
  ru: 'Спасибо, что обратились в NovaTel. Хорошего дня!',
  uz: "NovaTel'ga murojaat qilganingiz uchun rahmat. Kuningiz xayrli o'tsin!",
  en: 'Thanks for contacting NovaTel. Have a great day!',
}

// Per-conversation serialization: chain turns so two messages in the same
// conversation never interleave. `pending` enforces a small queue cap.
const chains = new Map<string, Promise<unknown>>()
const pending = new Map<string, number>()

function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve()
  const result = prev.then(() => task())
  const guard = result.then(
    () => {},
    () => {},
  )
  chains.set(key, guard)
  void guard.then(() => {
    if (chains.get(key) === guard) chains.delete(key)
  })
  return result
}

export async function handleTurn(
  msg: InboundMessage,
  ctx: ChannelContext = {},
): Promise<OutboundMessage[]> {
  const queued = pending.get(msg.conversationId) ?? 0
  if (queued >= MAX_QUEUE) {
    return [{ text: BUSY_REPLY }]
  }
  pending.set(msg.conversationId, queued + 1)
  try {
    return await runExclusive(msg.conversationId, () => processTurn(msg, ctx))
  } finally {
    const remaining = (pending.get(msg.conversationId) ?? 1) - 1
    if (remaining <= 0) pending.delete(msg.conversationId)
    else pending.set(msg.conversationId, remaining)
  }
}

async function processTurn(
  msg: InboundMessage,
  ctx: ChannelContext,
): Promise<OutboundMessage[]> {
  const started = Date.now()
  logger.info({
    event: 'turn.start',
    conversationId: msg.conversationId,
    channel: msg.channel,
  })
  try {
    if (msg.command === 'end') {
      return [{ text: await closeSession(msg) }]
    }

    if (msg.command === 'start') {
      const userId = await resolveUserId(msg.channel, msg.externalUserId)
      if (userId !== null) {
        await endSession(userId).catch(() => {})
        const profile = await getUserById(userId)
        return [{ text: welcomeBack(profile?.language ?? 'en') }]
      }
      return [{ text: await startOnboarding(msg.conversationId) }]
    }

    if (msg.text === null) {
      // Non-text content must not advance any state machine.
      return [{ text: NON_TEXT_REPLY }]
    }

    const userId = await resolveUserId(msg.channel, msg.externalUserId)
    if (userId === null) {
      return [{ text: await onboard(msg) }]
    }

    return [{ text: await runAgent(userId, msg, ctx) }]
  } finally {
    logger.info({
      event: 'turn.end',
      conversationId: msg.conversationId,
      durationMs: Date.now() - started,
    })
  }
}

async function onboard(msg: InboundMessage): Promise<string> {
  // First contact from an unknown user (any message) → greet and ask for number.
  if (!(await isOnboarding(msg.conversationId))) {
    return startOnboarding(msg.conversationId)
  }
  const result = await handleOnboardingReply(
    msg.channel,
    msg.externalUserId,
    msg.conversationId,
    msg.text!,
  )
  return result.reply
}

async function runAgent(
  userId: number,
  msg: InboundMessage,
  ctx: ChannelContext,
): Promise<string> {
  await ctx.sendTyping?.()
  const context = await buildContextMessages(userId, msg.text!)
  const result = await mirzo.generate(msg.text!, {
    memory: { thread: msg.conversationId, resource: String(userId) },
    context,
  })
  return result.text
}

async function closeSession(msg: InboundMessage): Promise<string> {
  const userId = await resolveUserId(msg.channel, msg.externalUserId)
  if (userId === null) return GOODBYE.en
  const profile = await getUserById(userId)
  await endSession(userId).catch(() => {})
  return GOODBYE[profile?.language ?? 'en']
}
