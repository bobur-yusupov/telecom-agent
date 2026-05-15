import { logger } from '../utils/logger.js'

export type CancellationState =
  | 'INIT'
  | 'REASON_ASKED'
  | 'OFFER_PRESENTED'
  | 'OFFER_DECLINED'
  | 'ALTERNATIVE_PRESENTED'
  | 'ESCALATED'

const VALID_NEXT: Record<CancellationState, readonly CancellationState[]> = {
  INIT: ['REASON_ASKED'],
  REASON_ASKED: ['OFFER_PRESENTED'],
  OFFER_PRESENTED: ['OFFER_DECLINED', 'ESCALATED'],
  OFFER_DECLINED: ['ALTERNATIVE_PRESENTED'],
  ALTERNATIVE_PRESENTED: ['ESCALATED'],
  ESCALATED: [],
}

const states = new Map<number, CancellationState>()

export function getCancellationState(userId: number): CancellationState {
  return states.get(userId) ?? 'INIT'
}

export function isInCancellationFlow(userId: number): boolean {
  const s = getCancellationState(userId)
  return s !== 'INIT'
}

export function setCancellationState(userId: number, next: CancellationState): boolean {
  const current = getCancellationState(userId)
  if (current === next) return true
  if (!VALID_NEXT[current].includes(next)) {
    logger.warn({
      event: 'agent.escalate',
      userId,
      message: `cancellation FSM rejected ${current} → ${next}`,
    })
    return false
  }
  states.set(userId, next)
  return true
}

export function advanceThrough(userId: number, path: readonly CancellationState[]): boolean {
  for (const step of path) {
    if (!setCancellationState(userId, step)) return false
  }
  return true
}

export function resetCancellationState(userId: number): void {
  states.delete(userId)
}
