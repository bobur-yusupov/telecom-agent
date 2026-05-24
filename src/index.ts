import 'dotenv/config'

if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error('Missing required env var: GOOGLE_API_KEY')
}

async function main() {
  const { initDb } = await import('./db/init.js')
  await initDb()

  const { buildRetriever } = await import('./kb/retriever.js')
  await buildRetriever()

  // Channels are optional and self-gating: each starts only if configured.
  const { startTelegram } = await import('./channels/telegram.js')
  await startTelegram()
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
