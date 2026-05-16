import { Mastra } from '@mastra/core/mastra'
import { PostgresStore } from '@mastra/pg'
import { google } from '@ai-sdk/google'
import {
  createAnswerRelevancyScorer,
  createFaithfulnessScorer,
  createToneScorer,
} from '@mastra/evals/scorers/prebuilt'
import { getPgConfig } from '../db/client.js'
import { mirzo } from '../agents/mirzo.js'

const judgeModel = google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite')

export const mastra = new Mastra({
  agents: { mirzo },
  storage: new PostgresStore({
    id: 'mirzo-storage',
    schemaName: 'mastra',
    ...getPgConfig(),
  }),
  scorers: {
    faithfulness: createFaithfulnessScorer({ model: judgeModel }),
    'answer-relevancy': createAnswerRelevancyScorer({ model: judgeModel }),
    tone: createToneScorer(),
  },
})
