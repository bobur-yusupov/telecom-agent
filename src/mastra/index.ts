import { Mastra } from '@mastra/core/mastra'
import { PostgresStore } from '@mastra/pg'
import { getPgConfig } from '../db/client.js'
import { mirzo } from '../agents/mirzo.js'
import { google } from '../agents/provider.js';
import { scopeEnforcementScorer } from '../eval/scope-enforcement-scorer.js'
import {
  createAnswerRelevancyScorer,
} from '@mastra/evals/scorers/prebuilt';

const judge = google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite')

export const mastra = new Mastra({
  agents: { mirzo },
  storage: new PostgresStore({
    id: 'mirzo-storage',
    schemaName: 'mastra',
    ...getPgConfig(),
  }),
  scorers: {
    scopeEnforcementScorer,
    answerRelevancy: createAnswerRelevancyScorer({ model: judge }),
  },
});
