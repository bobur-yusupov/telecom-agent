import { resetCancellationState } from '../agents/cancellation.js'
import { getPool } from '../db/client.js'
import { logger } from '../utils/logger.js'

export interface LongTermMemory {
  userId: number
  lastInteractionDate: string
  totalInteractions: number
  offersShown: string[]
  previousPlans: string[]
  resolvedIssues: string[]
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[]
  summary: string
}

interface LongTermMemoryRow {
  user_id: number
  last_interaction_date: Date
  total_interactions: number
  offers_shown: string[]
  previous_plans: string[]
  resolved_issues: string[]
  satisfaction_signals: ('positive' | 'negative' | 'neutral')[]
  summary: string
}

function rowToMemory(row: LongTermMemoryRow): LongTermMemory {
  return {
    userId: row.user_id,
    lastInteractionDate: row.last_interaction_date.toISOString(),
    totalInteractions: row.total_interactions,
    offersShown: row.offers_shown,
    previousPlans: row.previous_plans,
    resolvedIssues: row.resolved_issues,
    satisfactionSignals: row.satisfaction_signals,
    summary: row.summary,
  }
}

export async function getLongTermMemory(userId: number): Promise<LongTermMemory | undefined> {
  const { rows } = await getPool().query<LongTermMemoryRow>(
    `SELECT user_id, last_interaction_date, total_interactions, offers_shown,
            previous_plans, resolved_issues, satisfaction_signals, summary
     FROM app.long_term_memory WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0] ? rowToMemory(rows[0]) : undefined
}

export async function setLongTermMemory(userId: number, memory: LongTermMemory): Promise<void> {
  await getPool().query(
    `INSERT INTO app.long_term_memory (
       user_id, last_interaction_date, total_interactions, offers_shown,
       previous_plans, resolved_issues, satisfaction_signals, summary
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       last_interaction_date = EXCLUDED.last_interaction_date,
       total_interactions = EXCLUDED.total_interactions,
       offers_shown = EXCLUDED.offers_shown,
       previous_plans = EXCLUDED.previous_plans,
       resolved_issues = EXCLUDED.resolved_issues,
       satisfaction_signals = EXCLUDED.satisfaction_signals,
       summary = EXCLUDED.summary`,
    [
      userId,
      memory.lastInteractionDate,
      memory.totalInteractions,
      memory.offersShown,
      memory.previousPlans,
      memory.resolvedIssues,
      memory.satisfactionSignals,
      memory.summary,
    ],
  )
}

export async function updateLongTermMemory(
  userId: number,
  patch: Partial<LongTermMemory>,
): Promise<void> {
  const existing = (await getLongTermMemory(userId)) ?? {
    userId,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    offersShown: [],
    previousPlans: [],
    resolvedIssues: [],
    satisfactionSignals: [],
    summary: '',
  }
  await setLongTermMemory(userId, { ...existing, ...patch })
}

export async function recordPresentedOffer(userId: number, offerId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO app.session_presented_offers (user_id, offer_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, offerId],
  )
}

async function flushPresentedOffers(userId: number): Promise<string[]> {
  const pool = getPool()
  const { rows } = await pool.query<{ offer_id: string }>(
    `SELECT offer_id FROM app.session_presented_offers WHERE user_id = $1`,
    [userId],
  )
  await pool.query(`DELETE FROM app.session_presented_offers WHERE user_id = $1`, [userId])
  return rows.map((r) => r.offer_id)
}

export interface SessionEndPayload {
  scenario?: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention'
  resolutionType?: 'self-served' | 'escalated' | 'abandoned'
  resolvedIssueType?: string
  satisfactionSignal?: 'positive' | 'negative' | 'neutral'
  summary?: string
  previousPlanId?: string
}

export async function endSession(
  userId: number,
  payload: SessionEndPayload = {},
): Promise<LongTermMemory> {
  const existing = (await getLongTermMemory(userId)) ?? {
    userId,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    offersShown: [],
    previousPlans: [],
    resolvedIssues: [],
    satisfactionSignals: [],
    summary: '',
  }

  const newlyShown = await flushPresentedOffers(userId)
  const offersShown = Array.from(new Set([...existing.offersShown, ...newlyShown]))
  const resolvedIssues = payload.resolvedIssueType
    ? [...existing.resolvedIssues, payload.resolvedIssueType]
    : existing.resolvedIssues
  const satisfactionSignals = payload.satisfactionSignal
    ? [...existing.satisfactionSignals, payload.satisfactionSignal]
    : existing.satisfactionSignals
  const previousPlans = payload.previousPlanId
    ? [...existing.previousPlans, payload.previousPlanId]
    : existing.previousPlans

  const next: LongTermMemory = {
    ...existing,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: existing.totalInteractions + 1,
    offersShown,
    previousPlans,
    resolvedIssues,
    satisfactionSignals,
    summary: payload.summary ?? existing.summary,
  }
  await setLongTermMemory(userId, next)
  await resetCancellationState(userId)

  logger.info({
    event: 'turn.end',
    userId,
    ...(payload.scenario ? { scenario: payload.scenario } : {}),
    ...(payload.resolutionType ? { resolutionType: payload.resolutionType } : {}),
  })
  return next
}
