import { getPool } from '../db/client.js'

export interface Plan {
  id: string
  name: string
  dataGB: number
  callMinutesExternal: number
  callMinutesInternal: number
  priceSomoni: number
}

export interface DataAddon {
  id: string
  dataGB: number
  priceSomoni: number
}

interface PlanRow {
  id: string
  name: string
  data_gb: number
  call_minutes_external: number
  call_minutes_internal: number
  price_somoni: string
}

interface AddonRow {
  id: string
  data_gb: number
  price_somoni: string
}

function rowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    dataGB: row.data_gb,
    callMinutesExternal: row.call_minutes_external,
    callMinutesInternal: row.call_minutes_internal,
    priceSomoni: Number(row.price_somoni),
  }
}

function rowToAddon(row: AddonRow): DataAddon {
  return { id: row.id, dataGB: row.data_gb, priceSomoni: Number(row.price_somoni) }
}

export async function listPlans(): Promise<Plan[]> {
  const { rows } = await getPool().query<PlanRow>(
    `SELECT id, name, data_gb, call_minutes_external, call_minutes_internal, price_somoni
     FROM app.plans ORDER BY price_somoni ASC`,
  )
  return rows.map(rowToPlan)
}

export async function getPlanById(id: string): Promise<Plan | undefined> {
  const { rows } = await getPool().query<PlanRow>(
    `SELECT id, name, data_gb, call_minutes_external, call_minutes_internal, price_somoni
     FROM app.plans WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0] ? rowToPlan(rows[0]) : undefined
}

export async function listAddons(): Promise<DataAddon[]> {
  const { rows } = await getPool().query<AddonRow>(
    `SELECT id, data_gb, price_somoni FROM app.addons ORDER BY data_gb ASC`,
  )
  return rows.map(rowToAddon)
}

export async function getAddonById(id: string): Promise<DataAddon | undefined> {
  const { rows } = await getPool().query<AddonRow>(
    `SELECT id, data_gb, price_somoni FROM app.addons WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0] ? rowToAddon(rows[0]) : undefined
}
