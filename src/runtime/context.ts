import { getUserById } from '../data/users.js'
import { getLongTermMemory } from '../memory/longTerm.js'
import { getCancellationState } from '../agents/cancellation.js'
import { searchKB, type SearchResult } from '../kb/retriever.js'
import { logger } from '../utils/logger.js'

/**
 * Eager per-turn context preload (see spec/ARCHITECTURE.md "Context assembly").
 * Profile + KB are fetched in parallel at turn start and injected as a single
 * system message ahead of the user's text, so the agent always has the customer
 * profile and relevant KB chunks without a wasted round-trip.
 *
 * KB retrieval is best-effort: if the embedding service is unavailable the turn
 * still proceeds with profile + memory only.
 */

/** Minimal system-message shape, structurally compatible with the agent's `context` option. */
export type ContextMessage = { role: 'system'; content: string }

export async function buildContextMessages(
  userId: number,
  query: string,
): Promise<ContextMessage[]> {
  const [profile, kb, memory, cancellationState] = await Promise.all([
    getUserById(userId),
    safeSearchKB(query),
    getLongTermMemory(userId).catch(() => undefined),
    getCancellationState(userId).catch(() => 'INIT' as const),
  ])

  const sections: string[] = []

  if (profile) {
    const p = profile
    const low = p.balance <= p.preferences.lowBalanceThreshold ? ' (low)' : ''
    sections.push(
      [
        '[Profile]',
        `User ID: ${p.id} — pass this exact value as userId to every tool call.`,
        `Name: ${p.name} | Region: ${p.region} | Language: ${p.language}`,
        `Plan: ${p.plan} (${p.dataLimitGB} GB, ${p.dataUsedGB} GB used) | Monthly fee: ${p.monthlyFee} TJS`,
        `Balance: ${p.balance} TJS${low} | Payment: ${p.paymentStatus} | Churn risk: ${p.churnRisk}`,
        `Preferences: style=${p.preferences.communicationStyle}, length=${p.preferences.responseLength}`,
      ].join('\n'),
    )
  }

  if (memory) {
    const lines = ['[Memory]', `Last interaction: ${memory.lastInteractionDate}`]
    if (memory.summary) lines.push(`Summary: ${memory.summary}`)
    if (memory.offersShown.length) lines.push(`Offers already shown: ${memory.offersShown.join(', ')}`)
    if (memory.resolvedIssues.length) lines.push(`Past resolved issues: ${memory.resolvedIssues.join(', ')}`)
    sections.push(lines.join('\n'))
  }

  if (cancellationState !== 'INIT') {
    sections.push(`[Session]\ncancellationState: ${cancellationState}`)
  }

  if (kb.length) {
    const chunks = kb
      .map((c, i) => `${i + 1}. (${c.group}) Q: ${c.question}\n   A: ${c.answer}`)
      .join('\n')
    sections.push(`[KB]\n${chunks}`)
  }

  if (sections.length === 0) return []
  return [{ role: 'system', content: sections.join('\n\n') }]
}

async function safeSearchKB(query: string): Promise<SearchResult[]> {
  try {
    return await searchKB(query)
  } catch (err) {
    logger.warn({
      event: 'kb.retrieve',
      message: 'KB preload failed; proceeding without KB chunks',
      error: { message: err instanceof Error ? err.message : String(err) },
    })
    return []
  }
}
