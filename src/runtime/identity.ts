import { getPool } from '../db/client.js'

export async function resolveUserId(
  channel: string,
  externalUserId: string,
): Promise<number | null> {
  const { rows } = await getPool().query<{ user_id: number }>(
    `SELECT user_id FROM app.channel_identities WHERE channel = $1 AND external_id = $2 LIMIT 1`,
    [channel, externalUserId],
  )
  return rows[0]?.user_id ?? null
}

/** Bind (channel, externalUserId) → userId. Idempotent; re-binding updates. */
export async function bindIdentity(
  channel: string,
  externalUserId: string,
  userId: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO app.channel_identities (channel, external_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel, external_id)
       DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = NOW()`,
    [channel, externalUserId, userId],
  )
}
