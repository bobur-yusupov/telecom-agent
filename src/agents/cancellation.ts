import { getPool } from '../db/client.js'
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

export async function getCancellationState(userId: number): Promise<CancellationState> {
  const { rows } = await getPool().query<{ state: CancellationState }>(
    `SELECT state FROM app.cancellation_states WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0]?.state ?? 'INIT'
}

export async function isInCancellationFlow(userId: number): Promise<boolean> {
  const s = await getCancellationState(userId)
  return s !== 'INIT'
}

export async function setCancellationState(
  userId: number,
  next: CancellationState,
): Promise<boolean> {
  const current = await getCancellationState(userId)
  if (current === next) return true
  if (!VALID_NEXT[current].includes(next)) {
    logger.warn({
      event: 'agent.escalate',
      userId,
      message: `cancellation FSM rejected ${current} → ${next}`,
    })
    return false
  }
  await getPool().query(
    `INSERT INTO app.cancellation_states (user_id, state, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [userId, next],
  )
  return true
}

export async function resetCancellationState(userId: number): Promise<void> {
  await getPool().query(`DELETE FROM app.cancellation_states WHERE user_id = $1`, [userId])
}
