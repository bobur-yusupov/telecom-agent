import { randomUUID } from 'node:crypto'
import { mirzo } from '../../src/agents/mirzo.js'
import { resetCancellationState } from '../../src/agents/cancellation.js'
import { setLongTermMemory } from '../../src/memory/longTerm.js'
import { updateUser } from '../../src/data/users.js'
import { users as seedUsers } from '../../src/data/seeds/users.js'


export interface ToolCallRecord {
  toolName: string
  args: unknown
}

export interface ToolResultRecord {
  toolName: string
  result: unknown
}

export interface Turn {
  user: string
  assistant: string
  toolCalls: ToolCallRecord[]
  toolResults: ToolResultRecord[]
}

export interface ConversationResult {
  turns: Turn[]
  /** All tool names called across the conversation, in order. */
  allToolNames: string[]
  /** The agent's final reply text. */
  finalReply: string
}

// Gemini Flash Lite free tier is 15 requests/minute; we pace turns to stay
// under it. Override with EVAL_TURN_DELAY_MS=0 once on a paid tier.
const TURN_DELAY_MS = parseInt(process.env.EVAL_TURN_DELAY_MS ?? '5000', 10)

export async function runConversation(
  userMessages: string[],
  opts: { userId?: number } = {},
): Promise<ConversationResult> {
  if (opts.userId !== undefined) await resetUserState(opts.userId)

  const thread = randomUUID()
  const resource = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const turns: Turn[] = []

  for (let i = 0; i < userMessages.length; i++) {
    const user = userMessages[i]!
    if (TURN_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, TURN_DELAY_MS))
    }
    const result = await generateWithRetry(user, { memory: { thread, resource } })
    const toolCalls = (result.toolCalls ?? []).map((tc) => ({
      toolName: tc.payload.toolName,
      args: tc.payload.args,
    }))
    const toolResults = (result.toolResults ?? []).map((tr) => ({
      toolName: tr.payload.toolName,
      result: tr.payload.result,
    }))
    turns.push({ user, assistant: result.text, toolCalls, toolResults })
  }

  const allToolNames = turns.flatMap((t) => t.toolCalls.map((tc) => tc.toolName))
  return { turns, allToolNames, finalReply: turns[turns.length - 1]?.assistant ?? '' }
}

/** Reset cross-test state for a user. Run before any test that uses this user. */
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
  // Restore mutable user fields to seed values so test mutations (balance
  // deductions, plan changes, data add-ons) don't bleed between runs.
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

/** True if the text looks like Tajik/Russian Cyrillic. */
export function isCyrillic(text: string): boolean {
  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return cyrillic > latin
}

/** Shared rate-limit delay — use before any direct API call not inside runConversation. */
export async function rateLimitDelay(): Promise<void> {
  if (TURN_DELAY_MS > 0) await new Promise((r) => setTimeout(r, TURN_DELAY_MS))
}

/** Wrap mirzo.generate with retry-on-429 so rate-limit bursts don't fail tests. */
async function generateWithRetry(
  message: string,
  options: { memory: { thread: string; resource: string } },
): Promise<Awaited<ReturnType<typeof mirzo.generate>>> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await mirzo.generate(message, options)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('quota')
      if (!isRateLimit || attempt === MAX_RETRIES) throw err
      const match = msg.match(/retry in ([\d.]+)s/)
      const waitMs = Math.ceil((match ? parseFloat(match[1]!) : 60) * 1000) + 2000
      console.warn(`[eval] rate limited — waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
  throw new Error('generateWithRetry: max retries exceeded')
}
