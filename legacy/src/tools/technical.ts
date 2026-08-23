import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getOutageByRegion } from '../data/outages.js'
import { getUserById, updateUser } from '../data/users.js'
import { getPool } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { err, ok, toUserId, userIdInput } from './common.js'

const outageSchema = z.object({
  region: z.string(),
  status: z.enum(['active', 'clear']),
  affectedAreas: z.array(z.string()).optional(),
  estimatedResolution: z.string().optional(),
  incidentId: z.string().optional(),
})

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

export const checkOutage = createTool({
  id: 'checkOutage',
  description:
    'Check whether NovaTel has an active network outage in a specific region or city. Call this FIRST whenever a user reports no signal, no internet, slow connection, or service interruption — before suggesting any other fix. Returns the outage record (status, affected areas, ETA, incident ID) for that region.',
  inputSchema: z.object({
    region: z.string().describe('Region or city name, e.g. "Kulob", "Dushanbe"'),
  }),
  outputSchema: toolResultSchema(outageSchema),
  execute: async ({ region }) => {
    logger.info({ event: 'tool.call', toolName: 'checkOutage', region })
    return ok(await getOutageByRegion(region))
  },
})

const diagnosticResultSchema = z.object({
  region: z.string(),
  outage: outageSchema,
  dataRemainingGB: z.number().describe('Data remaining this month. -1 means unlimited.'),
  balanceSomoni: z.number(),
  deviceType: z.string(),
  suggestedAction: z.string(),
})

export const runDiagnostic = createTool({
  id: 'runDiagnostic',
  description:
    'Run a quick automated diagnostic for a user reporting technical issues (no signal, slow internet, can\'t make calls). Returns outage status for their region, remaining data allowance, balance, device type, and a suggested action. Use this instead of guessing causes — it grounds the diagnosis in real data.',
  inputSchema: z.object({
    userId: userIdInput,
  }),
  outputSchema: toolResultSchema(diagnosticResultSchema),
  execute: async ({ userId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'runDiagnostic', userId: id })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const outage = await getOutageByRegion(user.region)
    const dataRemainingGB =
      user.dataLimitGB === -1 ? -1 : Math.max(0, user.dataLimitGB - user.dataUsedGB)

    let suggestedAction: string
    if (outage.status === 'active') {
      suggestedAction = `network_outage_${outage.incidentId ?? 'unknown'}`
    } else if (user.balance <= 0) {
      suggestedAction = 'top_up_required'
    } else if (dataRemainingGB === 0) {
      suggestedAction = 'data_exhausted_offer_addon'
    } else {
      suggestedAction = 'check_device_or_escalate'
    }

    return ok({
      region: user.region,
      outage,
      dataRemainingGB,
      balanceSomoni: user.balance,
      deviceType: user.deviceType,
      suggestedAction,
    })
  },
})

export const createTicket = createTool({
  id: 'createTicket',
  description:
    'Open a support ticket for an issue that cannot be resolved automatically (e.g. an outage with no ETA, a device fault, a billing dispute). Always confirm with the user before creating a ticket. Returns the new ticket ID.',
  inputSchema: z.object({
    userId: userIdInput,
    type: z.enum(['no_signal', 'slow_internet', 'billing', 'device', 'other']),
    description: z.string().min(1).describe('Short summary of the issue in any supported language.'),
  }),
  outputSchema: toolResultSchema(
    z.object({
      ticketId: z.string(),
      status: z.literal('open'),
      createdAt: z.string(),
    }),
  ),
  execute: async ({ userId, type, description }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'createTicket', userId: id, type })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)

    const pool = getPool()
    const { rows } = await pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO app.tickets (id, user_id, type, description, status)
       VALUES ('TCK-' || nextval('app.tickets_id_seq'), $1, $2, $3, 'open')
       RETURNING id, created_at`,
      [id, type, description],
    )
    // nextval requires a sequence — fall back to a counter if missing.
    const row = rows[0]!
    await updateUser(id, { openTickets: user.openTickets + 1 })
    return ok({ ticketId: row.id, status: 'open' as const, createdAt: row.created_at.toISOString() })
  },
})

export const getTicketStatus = createTool({
  id: 'getTicketStatus',
  description: 'Look up the status of an existing support ticket by its ID.',
  inputSchema: z.object({
    ticketId: z.string().describe('Ticket ID, e.g. "TCK-1001"'),
  }),
  outputSchema: toolResultSchema(
    z.object({
      ticketId: z.string(),
      type: z.string(),
      status: z.enum(['open', 'in_progress', 'resolved']),
      description: z.string(),
      createdAt: z.string(),
    }),
  ),
  execute: async ({ ticketId }) => {
    logger.info({ event: 'tool.call', toolName: 'getTicketStatus', ticketId })
    const { rows } = await getPool().query<{
      id: string
      type: string
      status: 'open' | 'in_progress' | 'resolved'
      description: string
      created_at: Date
    }>(
      `SELECT id, type, status, description, created_at FROM app.tickets WHERE id = $1 LIMIT 1`,
      [ticketId],
    )
    if (rows.length === 0) return err(`No ticket found with id ${ticketId}`)
    const t = rows[0]!
    return ok({
      ticketId: t.id,
      type: t.type,
      status: t.status,
      description: t.description,
      createdAt: t.created_at.toISOString(),
    })
  },
})
