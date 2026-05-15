import 'dotenv/config'

const required = ['TELEGRAM_TOKEN', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

// Boot order: retriever → agent → bot
async function main() {
  const { buildRetriever } = await import('./kb/retriever.js')
  await buildRetriever()

  const { startBot } = await import('./bot/telegram.js')
  await startBot()
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
