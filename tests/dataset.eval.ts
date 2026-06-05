import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { google } from '../src/agents/provider.js'
import {
  createAnswerRelevancyScorer,
  createFaithfulnessScorer,
} from '@mastra/evals/scorers/prebuilt'
import { rateLimitDelay } from './helpers/runConversation.js'

/**
 * Batch-scores the generated dataset (eval-data/dataset.json) with the same
 * prebuilt scorers Studio uses. Generate the file first:  npm run gen:dataset
 *
 * Faithfulness/answer-relevancy use the Gemini judge model (rate-limited, paced
 * via rateLimitDelay). Tone is rule-based and free. If the dataset is missing,
 * the suite is skipped rather than failing.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET_PATH = resolve(__dirname, '../eval-data/dataset.json')

interface DatasetRecord {
  id: string
  scenario: string
  language: string
  input: string
  output: string
  context: string[]
  toolCalls: string[]
}

const FAITHFULNESS_FLOOR = 0.7
const RELEVANCY_FLOOR = 0.6

const judge = google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite')

function loadDataset(): DatasetRecord[] {
  if (!existsSync(DATASET_PATH)) return []
  return JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as DatasetRecord[]
}

const dataset = loadDataset()

describe.skipIf(dataset.length === 0)('Dataset scoring', () => {
  for (const record of dataset) {
    describe(`${record.id} (${record.scenario}/${record.language})`, () => {
      // Faithfulness only applies where the agent had tool-result context to
      // ground against. Skip records with no context (e.g. pure-policy answers).
      it.skipIf(record.context.length === 0)('is faithful to tool results', async () => {
        await rateLimitDelay()
        const scorer = createFaithfulnessScorer({ model: judge, options: { context: record.context } })
        const { score, reason } = await scorer.run({ input: record.input, output: record.output })
        if (score < FAITHFULNESS_FLOOR) console.error(`[${record.id}] faithfulness=${score}: ${reason}`)
        expect(score).toBeGreaterThanOrEqual(FAITHFULNESS_FLOOR)
      })

      it('answers the question (relevancy)', async () => {
        await rateLimitDelay()
        const scorer = createAnswerRelevancyScorer({ model: judge })
        const { score, reason } = await scorer.run({ input: record.input, output: record.output })
        if (score < RELEVANCY_FLOOR) console.error(`[${record.id}] relevancy=${score}: ${reason}`)
        expect(score).toBeGreaterThanOrEqual(RELEVANCY_FLOOR)
      })
    })
  }
})
