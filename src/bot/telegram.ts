import { Telegraf } from 'telegraf'

export async function startBot(): Promise<void> {
  const token = process.env.TELEGRAM_TOKEN
  if (!token || token === 'skip' || token.startsWith('your_telegram_bot_token')) {
    console.info('[bot] TELEGRAM_TOKEN is not set or set to skip. Running agent service in standby mode...')
    setInterval(() => {}, 60000)
    return
  }

  const bot = new Telegraf(token)

  bot.start((ctx) => ctx.reply('NovaTel support bot is starting up...'))
  bot.on('message', (ctx) => ctx.reply('Agent not yet wired up.'))

  try {
    await bot.launch()
    console.info('[bot] polling started')

    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
  } catch (err) {
    console.error('[bot] Failed to start Telegram bot:', err)
    console.info('[bot] Running agent service in standby mode...')
    setInterval(() => {}, 60000)
  }
}
