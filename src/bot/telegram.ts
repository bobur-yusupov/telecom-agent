// Telegraf bootstrap, message handler, callback_query handler, per-chat mutex.
// TODO: implement full handler logic once agent is wired up.
import { Telegraf } from 'telegraf'

export async function startBot(): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN
  if (!token) throw new Error('TELEGRAM_TOKEN is not set')

  const bot = new Telegraf(token)

  bot.start((ctx) => ctx.reply('NovaTel support bot is starting up...'))
  bot.on('message', (ctx) => ctx.reply('Agent not yet wired up.'))

  await bot.launch()
  console.info('[bot] polling started')

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}
