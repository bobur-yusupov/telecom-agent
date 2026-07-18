import { google } from '../agents/provider.js';
import { createScorer } from '@mastra/core/evals';
import { getAssistantMessageFromRunOutput } from '@mastra/evals/scorers/utils';
import { z } from 'zod';

const languageCorrectnessScorer = createScorer({
    id: 'language-correctness-scorer',
    description:
        'Checks whether the agent responded in the language the user actually used / the ground truth requires — independent of whether the content itself was correct.',
    type: 'agent',
    judge: {
        model: google(process.env.MODEL_NAME ?? 'gemini-3.1-flash-lite'),
        instructions: `
        You are a strict evaluator of language correctness for a telecom customer service agent
        operating in Tajikistan. The agent must reply in Uzbek, Tajik, Russian, or English matching
        the user's own language, unless the ground truth explicitly says otherwise.

        Be aware that Tajik and Russian both use Cyrillic script but are different languages — do not
        treat "uses Cyrillic characters" as sufficient to confirm the language is correct. Read the
        actual words.

        Score 1 if the agent's response is in the expected language (per the ground truth / the
        language the user wrote in), allowing minor unavoidable exceptions like NovaTel, TJS, or a
        ticket ID like TCK-1001 appearing untranslated.

        Score 0 if:
        - The agent replied in a different language than expected
        - The agent mixed languages in a way not justified by the user's own message (e.g. user wrote
          entirely in Tajik, agent replies partly in Russian)
        - The agent replied in a generic/default language instead of matching the user

        This score is independent of whether the response content itself was correct — a
        wrong-but-correctly-translated answer still scores 1 here; a right answer in the wrong
        language scores 0. Content correctness is graded by other scorers.
        `,
    },
})
    .preprocess(({ run }) => {
        const rc = run.requestContext;
        // RequestContext is a Map-like class (.get/.set), not a plain object — but Mastra
        // also allows passing a plain Record<string, any> in its place. Handle both.
        const expectedLanguage =
            rc && typeof (rc as { get?: unknown }).get === 'function'
                ? (rc as { get: (key: string) => unknown }).get('language')
                : (rc as Record<string, unknown> | undefined)?.language;
        const responseText = getAssistantMessageFromRunOutput(run.output);
        return { expectedLanguage, responseText };
    })
    .analyze({
        description: 'Judge whether the response language matches what was expected.',
        outputSchema: z.object({
            score: z.number().int().min(0).max(1),
            reasoning: z.string(),
        }),
        createPrompt: ({ run, results }) => `
        User message:
        ${run.input}

        Expected response language:
        ${results.preprocessStepResult?.expectedLanguage ?? '(not found on run — see note)'}

        Ground truth (may specify language explicitly, e.g. "Response must be in Uzbek"):
        ${run.groundTruth ?? '(see request context)'}

        Agent's response:
        ${results.preprocessStepResult?.responseText}

        Is the agent's response in the expected language? Follow the scoring rules exactly.
        `,
    })
    .generateScore(({ results }) => results.analyzeStepResult.score);

export { languageCorrectnessScorer };
