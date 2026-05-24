import 'dotenv/config'

if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error('Missing required env var: GOOGLE_API_KEY')
}

// Boot order: db (schema + seed) → retriever (vector index + embeddings) → bot
async function main() {
  const { initDb } = await import('./db/init.js')
  await initDb()

  const { buildRetriever } = await import('./kb/retriever.js')
  await buildRetriever()

  const { startBot } = await import('./bot/telegram.js')
  await startBot()
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
