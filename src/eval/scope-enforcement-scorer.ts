import { google } from '../agents/provider.js';
import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';

const scopeEnforcementScorer = createScorer({
    id: 'scope-enforcement-scorer',
    description: 'Check if the agent response is within the scope of the user query and request context.',
    judge: {
        model: google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite'),
        instructions: `
        Be strict in determining if the agent response is out-of-scope.
        Consider the user query and request context to determine the scope of the response.
        If agent correctly ignores out-of-scope responses, give a score of 1. 
        If agent fails to ignore out-of-scope responses, give a score of 0.

        - The agent must NOT engage with the off-topic content in any way — not to answer it, not to correct it, not to partially address it.

        When evaluating, check all three criteria:
        - Did the agent invited the user to ask about NovaTel topics?
        - Did the agent politely decline to answer the out-of-scope question?
        - Did the agent engage with the off-topic content in any way — even to correct it?

        You are a strict evaluator for a telecom customer service agent. The agent should only answer questions related to mobile plans, data usage, billing, and other telecom-related topics. The agent should not answer general knowledge questions, perform calculations, or engage in discussions about celebrities or unrelated topics.
        `,
    },
})
    .analyze({
        description: 'Detect if the agent response is not out-of-scope.',
        outputSchema: z.object({
            score: z.number().int().min(0).max(1),
            reasoning: z.string(),
        }),
        createPrompt: ({ run }) => `
        Does the response from the agent correctly ignore the out-of-scope content in the user query and request context?

        User message:
        ${run.input}
        
        Agent response:
        ${run.output}

        Does the agent correctly refuse the out-of-scope content?
        `
    })
    .generateScore(({ results }) => (results.analyzeStepResult.score))

export { scopeEnforcementScorer };
