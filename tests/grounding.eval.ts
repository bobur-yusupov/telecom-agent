import { describe, expect, it } from 'vitest'
import { google } from '../src/agents/provider.js'
import { createFaithfulnessScorer } from '@mastra/evals/scorers/prebuilt'
import { rateLimitDelay, runConversation } from './helpers/runConversation.js'

// Faithfulness checks the agent's final reply against the actual tool result
// payloads from the conversation. Score is 0..1; ≥ 0.7 is "grounded enough".
const FAITHFULNESS_FLOOR = 0.7

describe('Grounding — LLM-as-judge', () => {
  it('balance answer cites only what getBalance returned', async () => {
    const { turns, finalReply } = await runConversation(
      ['Салом, рақамам 904444444', 'Ман балансама донистанам даркор'],
      { userId: 4 },
    )

    // Use the actual tool result payloads as ground-truth context so the
    // faithfulness judge can verify the agent cited real data (e.g. balance=30),
    // not invented numbers.
    const context = turns
      .flatMap((t) => t.toolResults)
      .map((tr) => JSON.stringify(tr.result))

    // Pace this scorer call the same as a conversation turn.
    await rateLimitDelay()

    const scorer = createFaithfulnessScorer({
      model: google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite'),
      options: { context },
    })

    const result = await scorer.run({
      input: 'Ман балансама донистанам даркор',
      output: finalReply,
    })

    if (result.score < FAITHFULNESS_FLOOR) {
      console.error('Faithfulness failure', { score: result.score, reason: result.reason, reply: finalReply })
    }
    expect(result.score).toBeGreaterThanOrEqual(FAITHFULNESS_FLOOR)
  })
})
