import { Pool } from 'pg'

export interface PgConnectionConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export function getPgConfig(): PgConnectionConfig {
  return {
    host: process.env.PGHOST ?? 'localhost',
    port: parseInt(process.env.PGPORT ?? '5432', 10),
    user: process.env.PGUSER ?? 'mirzo',
    password: process.env.PGPASSWORD ?? 'mirzo',
    database: process.env.PGDATABASE ?? 'mirzo',
  }
}

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ ...getPgConfig(), max: 10 })
    pool.on('error', (err) => {
      console.error('[pg] idle client error', err)
    })
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
