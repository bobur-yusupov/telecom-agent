import { Telegraf, type Context } from 'telegraf'
import { message } from 'telegraf/filters'
import { handleTurn } from '../runtime/runtime.js'
import type { InboundMessage } from '../runtime/types.js'
import { logger } from '../utils/logger.js'

/**
 * Telegram channel adapter. Its only job is translation: Telegraf updates →
 * {@link InboundMessage}, and {@link OutboundMessage}s → `ctx.reply` (splitting
 * to Telegram's length cap). All conversation logic lives in the runtime; this
 * file is the entire Telegram-specific surface of the app.
 */

const CHANNEL = 'telegram'
const TELEGRAM_LIMIT = 3800
const TIMEOUT_REPLY = "I'm having trouble right now, please try again in a moment."

export async function startTelegram(): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN
  if (!token || token === 'skip' || token.startsWith('your_telegram_bot_token')) {
    logger.info({ event: 'turn.start', message: 'TELEGRAM_TOKEN not set — Telegram channel disabled' })
    return
  }

  const bot = new Telegraf(token)

  bot.command('start', (ctx) => dispatch(ctx, { text: '/start', command: 'start' }))
  bot.command('end', (ctx) => dispatch(ctx, { text: '/end', command: 'end' }))
  bot.on(message('text'), (ctx) => dispatch(ctx, { text: ctx.message.text }))
  // Catch-all for non-text content (photo, voice, sticker, …). Text updates are
  // already consumed above, so this only fires for unsupported message types.
  bot.on('message', (ctx) => dispatch(ctx, { text: null }))

  bot.catch((err) => logger.error({ event: 'turn.end', error: toErr(err) }))

  // launch() resolves only when the bot stops; do not await it here.
  void bot.launch().catch((err) => logger.error({ event: 'turn.end', error: toErr(err) }))
  logger.info({ event: 'turn.start', message: 'Telegram channel polling started' })

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

async function dispatch(
  ctx: Context,
  partial: { text: string | null; command?: 'start' | 'end' },
): Promise<void> {
  if (!ctx.chat || !ctx.from) return

  const inbound: InboundMessage = {
    conversationId: `${CHANNEL}:${ctx.chat.id}`,
    channel: CHANNEL,
    externalUserId: String(ctx.from.id),
    text: partial.text,
    ...(partial.command ? { command: partial.command } : {}),
  }

  try {
    const replies = await handleTurn(inbound, {
      sendTyping: async () => {
        await ctx.sendChatAction('typing')
      },
    })
    for (const reply of replies) {
      for (const part of splitMessage(reply.text)) {
        await ctx.reply(part)
      }
    }
  } catch (err) {
    logger.error({ event: 'turn.end', error: toErr(err) })
    await ctx.reply(TIMEOUT_REPLY).catch(() => {})
  }
}

/** Split a reply at paragraph boundaries to stay under Telegram's 4096 cap. */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text]
  const parts: string[] = []
  let current = ''
  for (const para of text.split('\n\n')) {
    if (para.length > limit) {
      if (current) {
        parts.push(current)
        current = ''
      }
      for (let i = 0; i < para.length; i += limit) parts.push(para.slice(i, i + limit))
      continue
    }
    if (current && current.length + para.length + 2 > limit) {
      parts.push(current)
      current = ''
    }
    current = current ? `${current}\n\n${para}` : para
  }
  if (current) parts.push(current)
  return parts
}

function toErr(err: unknown): { message: string; stack?: string } {
  return err instanceof Error
    ? { message: err.message, ...(err.stack ? { stack: err.stack } : {}) }
    : { message: String(err) }
}
