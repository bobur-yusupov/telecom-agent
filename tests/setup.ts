import 'dotenv/config'
import { beforeAll, afterAll } from 'vitest'
import { getPool } from '../src/db/client.js'
import { initDb } from '../src/db/init.js'
import { buildRetriever } from '../src/kb/retriever.js'

beforeAll(async () => {
  // 1. Ensure the schema exists (idempotent — CREATE … IF NOT EXISTS).
  //    On a fresh ephemeral DB this creates everything and seeds it.
  await initDb()

  // 2. Wipe any mutations left by a prior run (no-op on a fresh DB, but keeps
  //    the suite deterministic when pointed at a persistent DB). CASCADE clears
  //    FK-dependent tables (long_term_memory, channel_identities, …).
  await getPool().query(`
    TRUNCATE
      app.users,
      app.plans,
      app.addons,
      app.outages,
      app.escalations
    RESTART IDENTITY CASCADE
  `)

  // 3. Re-seed the now-empty tables from the seed data.
  await initDb()

  // 4. Build the KB vector index (best-effort — skipped if Ollama is offline).
  await buildRetriever()
})

afterAll(async () => {
  await getPool().end()
})
