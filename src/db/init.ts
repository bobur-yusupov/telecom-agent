import { getPool } from './client.js'
import { SCHEMA_SQL } from './schema.js'
import { users as mockUsers } from '../data/seeds/users.js'
import { plans as mockPlans, addons as mockAddons } from '../data/seeds/plans.js'
import { outages as mockOutages } from '../data/seeds/outages.js'
import { logger } from '../utils/logger.js'

export async function initDb(): Promise<void> {
  const pool = getPool()
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
  await pool.query(SCHEMA_SQL)

  await seedUsers()
  await seedPlans()
  await seedAddons()
  await seedOutages()

  logger.info({ event: 'kb.retrieve', message: 'db ready' })
}

async function seedUsers(): Promise<void> {
  const pool = getPool()
  const { rowCount } = await pool.query('SELECT 1 FROM app.users LIMIT 1')
  if (rowCount && rowCount > 0) return
  for (const u of mockUsers) {
    await pool.query(
      `INSERT INTO app.users (
        id, telegram_id, mobile_number, name, persona, age, language, region,
        plan, monthly_fee, data_used_gb, data_limit_gb, balance, next_bill_date,
        last_invoice_amount, payment_status, churn_risk, open_tickets, device_type,
        preferences, interaction_history
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) ON CONFLICT (id) DO NOTHING`,
      [
        u.id, u.telegramId, u.mobileNumber, u.name, u.persona, u.age, u.language, u.region,
        u.plan, u.monthlyFee, u.dataUsedGB, u.dataLimitGB, u.balance, u.nextBillDate,
        u.lastInvoiceAmount, u.paymentStatus, u.churnRisk, u.openTickets, u.deviceType,
        JSON.stringify(u.preferences), JSON.stringify(u.interactionHistory),
      ],
    )
  }
}

async function seedPlans(): Promise<void> {
  const pool = getPool()
  for (const p of mockPlans) {
    await pool.query(
      `INSERT INTO app.plans (id, name, data_gb, call_minutes_external, call_minutes_internal, price_somoni)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         data_gb = EXCLUDED.data_gb,
         call_minutes_external = EXCLUDED.call_minutes_external,
         call_minutes_internal = EXCLUDED.call_minutes_internal,
         price_somoni = EXCLUDED.price_somoni`,
      [p.id, p.name, p.dataGB, p.callMinutesExternal, p.callMinutesInternal, p.priceSomoni],
    )
  }
}

async function seedAddons(): Promise<void> {
  const pool = getPool()
  for (const a of mockAddons) {
    await pool.query(
      `INSERT INTO app.addons (id, data_gb, price_somoni) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET data_gb = EXCLUDED.data_gb, price_somoni = EXCLUDED.price_somoni`,
      [a.id, a.dataGB, a.priceSomoni],
    )
  }
}

async function seedOutages(): Promise<void> {
  const pool = getPool()
  for (const o of mockOutages) {
    await pool.query(
      `INSERT INTO app.outages (region, status, affected_areas, estimated_resolution, incident_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (region) DO UPDATE SET
         status = EXCLUDED.status,
         affected_areas = EXCLUDED.affected_areas,
         estimated_resolution = EXCLUDED.estimated_resolution,
         incident_id = EXCLUDED.incident_id`,
      [
        o.region,
        o.status,
        o.affectedAreas ?? null,
        o.estimatedResolution ?? null,
        o.incidentId ?? null,
      ],
    )
  }
}
