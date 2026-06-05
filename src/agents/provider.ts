import { createGoogleGenerativeAI } from '@ai-sdk/google'

const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

export const google = createGoogleGenerativeAI(apiKey ? { apiKey } : {})
