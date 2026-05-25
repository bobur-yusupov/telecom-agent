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
const ERROR_REPLY = "I'm having trouble right now, please try again in a moment."

type Lang = UserProfile['language']

/**
 * Quiet window after the last message before a turn is processed. Tuned wider
 * than a single LLM turn is fast: people type one thought as several quick
 * phrases, and a turn takes ~10s, so a too-short window splits one question
 * into multiple redundant turns.
 */
function debounceMs(): number {
  return parseInt(process.env.TURN_DEBOUNCE_MS ?? '4000', 10)
}

const GOODBYE: Record<Lang, string> = {
  tj: 'Ташаккур, ки ба NovaTel муроҷиат кардед. Рӯзи хуш!',
  ru: 'Спасибо, что обратились в NovaTel. Хорошего дня!',
  uz: "NovaTel'ga murojaat qilganingiz uchun rahmat. Kuningiz xayrli o'tsin!",
  en: 'Thanks for contacting NovaTel. Have a great day!',
}

// Per-conversation serialization: chain turns so two turns in the same
// conversation never interleave.
const chains = new Map<string, Promise<unknown>>()

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

// Debounce buffer: consecutive text messages from one conversation are collected
// and processed as a single turn once the user pauses, so partial/fragmented
// messages get one coherent reply instead of one reply per fragment.
interface Buffer {
  texts: string[]
  timer: ReturnType<typeof setTimeout>
  ctx: ChannelContext
  base: InboundMessage
}
const buffers = new Map<string, Buffer>()

/**
 * Entry point for a channel. Text messages are buffered and coalesced; commands
 * (`/start`, `/end`) and non-text content are handled immediately (after
 * flushing any buffered text first). Replies are pushed via `ctx.send`.
 */
export async function handleTurn(msg: InboundMessage, ctx: ChannelContext): Promise<void> {
  if (msg.command || msg.text === null) {
    await flushBuffer(msg.conversationId)
    await deliver(msg.conversationId, ctx, () => processTurn(msg, ctx))
    return
  }

  // Immediate "typing" feedback while we wait for more fragments — signals the
  // message landed, so the user waits instead of re-sending and splitting turns.
  void ctx.sendTyping?.().catch(() => {})

  const existing = buffers.get(msg.conversationId)
  if (existing) {
    existing.texts.push(msg.text)
    existing.ctx = ctx
    clearTimeout(existing.timer)
    existing.timer = setTimeout(() => void flushBuffer(msg.conversationId), debounceMs())
    return
  }
  buffers.set(msg.conversationId, {
    texts: [msg.text],
    ctx,
    base: msg,
    timer: setTimeout(() => void flushBuffer(msg.conversationId), debounceMs()),
  })
}

/** Process whatever text is buffered for a conversation as one combined turn. */
async function flushBuffer(conversationId: string): Promise<void> {
  const buf = buffers.get(conversationId)
  if (!buf) return
  clearTimeout(buf.timer)
  buffers.delete(conversationId)
  const merged: InboundMessage = { ...buf.base, text: buf.texts.join('\n') }
  await deliver(conversationId, buf.ctx, () => processTurn(merged, buf.ctx))
}

/** Run a turn under the per-conversation mutex and push its reply via the channel. */
async function deliver(
  conversationId: string,
  ctx: ChannelContext,
  task: () => Promise<OutboundMessage[]>,
): Promise<void> {
  try {
    const out = await runExclusive(conversationId, task)
    if (out.length) await ctx.send(out)
  } catch (err) {
    logger.error({
      event: 'turn.end',
      conversationId,
      error: { message: err instanceof Error ? err.message : String(err) },
    })
    await ctx.send([{ text: ERROR_REPLY }]).catch(() => {})
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
