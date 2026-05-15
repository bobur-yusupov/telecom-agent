import { resetCancellationState } from '../agents/cancellation.js'
import { logger } from '../utils/logger.js'

export interface LongTermMemory {
  userId: number
  lastInteractionDate: string   // ISO 8601
  totalInteractions: number
  offersShown: string[]         // retention offer IDs already presented
  previousPlans: string[]
  resolvedIssues: string[]      // issue types from createTicket calls
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[]
  summary: string               // 1-2 sentence agent-written recap of last session
}

const store = new Map<number, LongTermMemory>()

export function getLongTermMemory(userId: number): LongTermMemory | undefined {
  return store.get(userId)
}

export function setLongTermMemory(userId: number, memory: LongTermMemory): void {
  store.set(userId, memory)
}

function emptyMemory(userId: number): LongTermMemory {
  return {
    userId,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    offersShown: [],
    previousPlans: [],
    resolvedIssues: [],
    satisfactionSignals: [],
    summary: '',
  }
}

export function updateLongTermMemory(userId: number, patch: Partial<LongTermMemory>): void {
  const existing = store.get(userId) ?? emptyMemory(userId)
  store.set(userId, { ...existing, ...patch })
}

// Session-scoped presented-offer cache. Flushed into LongTermMemory.offersShown
// when endSession runs. Per-spec: offers are recorded as "shown" only at session
// end, so they survive even if the user disconnects without applying one.
const sessionPresentedOffers = new Map<number, Set<string>>()

export function recordPresentedOffer(userId: number, offerId: string): void {
  const set = sessionPresentedOffers.get(userId) ?? new Set<string>()
  set.add(offerId)
  sessionPresentedOffers.set(userId, set)
}

export interface SessionEndPayload {
  scenario?: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention'
  resolutionType?: 'self-served' | 'escalated' | 'abandoned'
  resolvedIssueType?: string
  satisfactionSignal?: 'positive' | 'negative' | 'neutral'
  summary?: string
  previousPlanId?: string
}

export function endSession(userId: number, payload: SessionEndPayload = {}): LongTermMemory {
  const existing = store.get(userId) ?? emptyMemory(userId)
  const presented = sessionPresentedOffers.get(userId)
  const offersShown = presented
    ? Array.from(new Set([...existing.offersShown, ...presented]))
    : existing.offersShown
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
  store.set(userId, next)
  sessionPresentedOffers.delete(userId)
  resetCancellationState(userId)

  logger.info({
    event: 'turn.end',
    userId,
    ...(payload.scenario ? { scenario: payload.scenario } : {}),
    ...(payload.resolutionType ? { resolutionType: payload.resolutionType } : {}),
  })
  return next
}
