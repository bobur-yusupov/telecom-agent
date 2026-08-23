import { resetCancellationState } from '../agents/cancellation.js'
import { setLongTermMemory } from '../memory/longTerm.js'
import { updateUser } from './users.js'
import { users as seedUsers } from './seeds/users.js'

/**
 * Reset cross-run state for a user: cancellationState and longTermMemory are
 * Postgres-backed and keyed by userId only (no thread/session scoping), so they
 * leak across any two calls that reuse the same userId — including separate
 * dataset items in the same eval run, and separate runs entirely. Mutable user
 * fields (balance, plan, etc.) are also restored to seed values so earlier
 * state-changing tool calls don't bleed into later ones for the same user.
 *
 * Run before any test/eval item that uses a given userId.
 */
export async function resetUserState(userId: number): Promise<void> {
  await resetCancellationState(userId)
  await setLongTermMemory(userId, {
    userId,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    offersShown: [],
    previousPlans: [],
    resolvedIssues: [],
    satisfactionSignals: [],
    summary: '',
  })
  const seed = seedUsers.find((u) => u.id === userId)
  if (seed) {
    await updateUser(userId, {
      balance: seed.balance,
      dataLimitGB: seed.dataLimitGB,
      monthlyFee: seed.monthlyFee,
      paymentStatus: seed.paymentStatus,
      plan: seed.plan,
    })
  }
}
