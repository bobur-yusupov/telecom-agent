import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getOutageByRegion } from '../data/outages.js'
import { getUserById } from '../data/users.js'
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
    return ok(getOutageByRegion(region))
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
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const outage = getOutageByRegion(user.region)
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

interface Ticket {
  id: string
  userId: number
  type: string
  description: string
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: string
}

const tickets = new Map<string, Ticket>()
let ticketCounter = 1000

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
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const ticketId = `TCK-${ticketCounter++}`
    const ticket: Ticket = {
      id: ticketId,
      userId: id,
      type,
      description,
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    tickets.set(ticketId, ticket)
    user.openTickets += 1
    return ok({ ticketId, status: 'open' as const, createdAt: ticket.createdAt })
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
    const ticket = tickets.get(ticketId)
    if (!ticket) return err(`No ticket found with id ${ticketId}`)
    return ok({
      ticketId: ticket.id,
      type: ticket.type,
      status: ticket.status,
      description: ticket.description,
      createdAt: ticket.createdAt,
    })
  },
})
