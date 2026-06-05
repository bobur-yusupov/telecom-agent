/**
 * Reset the target database to clean seed state. Truncates the mutable app
 * tables (and their FK-dependents via CASCADE), then re-seeds from src/data/seeds.
 *
 * Targets whatever PG* env points to — defaults to the main dev DB
 * (localhost:5432). Use after demos/experiments drift the data (balances,
 * plans, data limits) away from the seed values.
 *
 * Run via: npm run db:reset
 */
import 'dotenv/config'
import { closePool, getPgConfig, getPool } from '../src/db/client.js'
import { initDb } from '../src/db/init.js'

async function main(): Promise<void> {
  const { host, port, database } = getPgConfig()
  console.log(`[reset-db] target: ${host}:${port}/${database}`)

  // Ensure schema exists (idempotent) before truncating.
  await initDb()

  await getPool().query(`
    TRUNCATE
      app.users,
      app.plans,
      app.addons,
      app.outages,
      app.tickets,
      app.escalations
    RESTART IDENTITY CASCADE
  `)
  console.log('[reset-db] truncated app tables (CASCADE cleared memory/state/identities)')

  // Re-seed the now-empty tables.
  await initDb()
  console.log('[reset-db] re-seeded from src/data/seeds — DB is back to baseline')

  await closePool()
}

main().catch((err) => {
  console.error('[reset-db] failed:', err)
  process.exitCode = 1
})
