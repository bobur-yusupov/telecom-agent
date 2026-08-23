import { getPool } from '../db/client.js'

export interface OutageRecord {
  region: string
  status: 'active' | 'clear'
  affectedAreas?: string[]
  estimatedResolution?: string
  incidentId?: string
}

interface OutageRow {
  region: string
  status: 'active' | 'clear'
  affected_areas: string[] | null
  estimated_resolution: Date | null
  incident_id: string | null
}

function rowToRecord(row: OutageRow): OutageRecord {
  const record: OutageRecord = { region: row.region, status: row.status }
  if (row.affected_areas) record.affectedAreas = row.affected_areas
  if (row.estimated_resolution) record.estimatedResolution = row.estimated_resolution.toISOString()
  if (row.incident_id) record.incidentId = row.incident_id
  return record
}

export async function getOutageByRegion(region: string): Promise<OutageRecord> {
  const { rows } = await getPool().query<OutageRow>(
    `SELECT region, status, affected_areas, estimated_resolution, incident_id
     FROM app.outages WHERE LOWER(region) = LOWER($1) LIMIT 1`,
    [region],
  )
  if (rows.length === 0) return { region, status: 'clear' }
  return rowToRecord(rows[0]!)
}
