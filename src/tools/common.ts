import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { searchKB as searchKBImpl } from '../kb/retriever.js'
import {
  getCancellationState,
  setCancellationState,
} from '../agents/cancellation.js'
import { endSession } from '../memory/longTerm.js'
import { getPool } from '../db/client.js'
import { logger } from '../utils/logger.js'

export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data }
}

export function err<T>(error: string): ToolResult<T> {
  return { success: false, error }
}

// Some smaller open models (Llama, Qwen) inconsistently serialise integer IDs
// as strings. We accept both at the schema level so Mastra's tool-call
// validation passes; downstream code normalises with `toUserId`.
export const userIdInput = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/),
])

export type UserIdInput = z.infer<typeof userIdInput>

export function toUserId(v: UserIdInput): number {
  return typeof v === 'string' ? parseInt(v, 10) : v
}

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

export const searchKB = createTool({
  id: 'searchKB',
  description:
    'Search the NovaTel knowledge base (FAQs, policies, payment methods, plan rules, troubleshooting) and return the top-3 matching chunks. Use this for general/policy questions ("how do I pay?", "what is the refund policy?") that are not specific to a single user account. Returns chunks ranked by relevance; chunks below a noise threshold are dropped automatically.',
  inputSchema: z.object({
    query: z.string().min(1).describe("The user's question, in their original language."),
  }),
  outputSchema: toolResultSchema(
    z.array(
      z.object({
        chunkId: z.string(),
        group: z.string(),
        score: z.number(),
        question: z.string(),
        answer: z.string(),
      }),
    ),
  ),
  execute: async ({ query }) => {
    const results = await searchKBImpl(query)
    logger.info({
      event: 'kb.retrieve',
      query,
      chunks: results.map((r) => ({ chunkId: r.chunkId, score: r.score })),
    })
    return ok(results)
  },
})

export const escalateToHuman = createTool({
  id: 'escalateToHuman',
  description:
    "Hand the conversation off to a human agent. Call this when: a tool returns success:false, the user explicitly asks for a person, the cancellation flow reaches ESCALATED, or 3 onboarding attempts fail. Always call after confirming the handoff with the user — except when a tool error makes that impossible. Returns a reference ID to share with the user.",
  inputSchema: z.object({
    userId: userIdInput,
    reason: z.string().min(1).describe('Short reason for escalation, in any supported language.'),
  }),
  outputSchema: toolResultSchema(
    z.object({
      referenceId: z.string(),
      message: z.string(),
      createdAt: z.string(),
    }),
  ),
  execute: async ({ userId, reason }) => {
    const id = toUserId(userId)
    const { rows } = await getPool().query<{ reference_id: string; created_at: Date }>(
      `INSERT INTO app.escalations (reference_id, user_id, reason)
       VALUES ('ESC-' || nextval('app.escalations_id_seq'), $1, $2)
       RETURNING reference_id, created_at`,
      [id, reason],
    )
    const { reference_id: referenceId, created_at: createdAt } = rows[0]!
    logger.warn({ event: 'agent.escalate', userId: id, referenceId, reason })

    const cancellationState = await getCancellationState(id)
    if (cancellationState !== 'INIT' && cancellationState !== 'ESCALATED') {
      await setCancellationState(id, 'ESCALATED')
    }
    await endSession(id, {
      resolutionType: 'escalated',
      satisfactionSignal: 'negative',
      summary: `Escalated to human. Reason: ${reason}. Reference: ${referenceId}.`,
    })

    return ok({
      referenceId,
      message: `A human agent will follow up. Reference: ${referenceId}.`,
      createdAt: createdAt.toISOString(),
    })
  },
})
