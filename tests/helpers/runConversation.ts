import { randomUUID } from 'node:crypto'
import { mirzo } from '../../src/agents/mirzo.js'
import { resetCancellationState } from '../../src/agents/cancellation.js'
import { setLongTermMemory } from '../../src/memory/longTerm.js'

export interface ToolCallRecord {
  toolName: string
  args: unknown
}

export interface Turn {
  user: string
  assistant: string
  toolCalls: ToolCallRecord[]
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
const TURN_DELAY_MS = parseInt(process.env.EVAL_TURN_DELAY_MS ?? '4500', 10)

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
    if (i > 0 && TURN_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, TURN_DELAY_MS))
    }
    const result = await mirzo.generate(user, {
      memory: { thread, resource },
    })
    const toolCalls = (result.toolCalls ?? []).map((tc) => ({
      toolName: tc.payload.toolName,
      args: tc.payload.args,
    }))
    turns.push({ user, assistant: result.text, toolCalls })
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
}

/** True if the text looks like Tajik/Russian Cyrillic. */
export function isCyrillic(text: string): boolean {
  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return cyrillic > latin
}
