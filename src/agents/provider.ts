import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'

const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

// Fixed judge model for eval scorers (faithfulness, scope-enforcement, etc).
// Deliberately NOT driven by MODEL_PROVIDER — the judge must stay constant
// so scores are comparable across runs that flag different subject models.
export const google = createGoogleGenerativeAI(apiKey ? { apiKey } : {})

// The model under test — flip via MODEL_PROVIDER to compare providers in
// evals (npm run eval:ci:gemini / :openai / :deepseek) or to run the live
// bot on a different provider. Powers both src/agents/mirzo.ts and,
// transitively, any eval that drives the live agent.
export const MODEL_PROVIDERS = ['gemini', 'openai', 'deepseek'] as const
export type ModelProvider = (typeof MODEL_PROVIDERS)[number]

const DEFAULT_MODEL_NAMES: Record<ModelProvider, string> = {
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-4.1-mini',
  deepseek: 'deepseek-chat',
}

function resolveModelProvider(): ModelProvider {
  const raw = (process.env.MODEL_PROVIDER ?? 'gemini').trim().toLowerCase()
  if ((MODEL_PROVIDERS as readonly string[]).includes(raw)) return raw as ModelProvider
  throw new Error(
    `Unknown MODEL_PROVIDER "${raw}" — expected one of: ${MODEL_PROVIDERS.join(', ')}`,
  )
}

export const modelProvider = resolveModelProvider()

function buildChatModel() {
  const modelName = process.env.MODEL_NAME ?? DEFAULT_MODEL_NAMES[modelProvider]
  switch (modelProvider) {
    case 'gemini':
      return google(modelName)
    case 'openai': {
      const openai = createOpenAI(process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : {})
      return openai(modelName)
    }
    case 'deepseek': {
      const deepseek = createDeepSeek(
        process.env.DEEPSEEK_API_KEY ? { apiKey: process.env.DEEPSEEK_API_KEY } : {},
      )
      return deepseek(modelName)
    }
  }
}

export const chatModel = buildChatModel()
