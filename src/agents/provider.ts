import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Honour GOOGLE_API_KEY (the name Mastra Studio prompts for) while still
// accepting the SDK's native GOOGLE_GENERATIVE_AI_API_KEY as a fallback.
const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

export const google = createGoogleGenerativeAI(apiKey ? { apiKey } : {})
