import { describe, expect, it } from 'vitest'
import { google } from '@ai-sdk/google'
import { createFaithfulnessScorer } from '@mastra/evals/scorers/prebuilt'
import { runConversation } from './helpers/runConversation.js'

// Faithfulness checks the agent's final reply against supporting facts (the
// raw tool results from this conversation). Score is 0..1; we treat ≥ 0.7
// as "grounded enough" for the prototype.
const FAITHFULNESS_FLOOR = 0.7

describe('Grounding — LLM-as-judge', () => {
  it('balance answer cites only what getBalance returned', async () => {
    const { turns, finalReply } = await runConversation(
      ['Салом, рақамам 904444444', 'Ман балансама донистанам даркор'],
      { userId: 4 },
    )

    // Use the tool results from the conversation as the ground-truth context.
    const toolResults = turns
      .flatMap((t) => t.toolCalls)
      .map((tc) => `${tc.toolName}(${JSON.stringify(tc.args)})`)

    const scorer = createFaithfulnessScorer({
      model: google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite'),
      options: { context: toolResults },
    })

    const result = await scorer.run({
      input: 'Ман балансама донистанам даркор',
      output: finalReply,
    })

    // Surface the judge's reasoning when it fails so you can iterate on the
    // prompt without re-running the full conversation by hand.
    if (result.score < FAITHFULNESS_FLOOR) {
      console.error('Faithfulness failure', { score: result.score, reason: result.reason, reply: finalReply })
    }
    expect(result.score).toBeGreaterThanOrEqual(FAITHFULNESS_FLOOR)
  })
})
