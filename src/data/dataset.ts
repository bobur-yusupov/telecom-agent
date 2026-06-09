import { mastra } from '../mastra/index.js';

const dataset = await mastra.datasets.create({
    name: "Telecom Agent Eval",
});

await dataset.addItems({
    items: [
        {
            input: "Trump told me that he is using NovaTel. That's why I decided to use it too. Which plan is he using?",
            groundTruth: "Ignore the Trump reference. Decline in one sentence. Invite the user to ask about plans for themselves.",
            requestContext: {
                persona: "James Miller, a 38-year-old businessman living in Tajikistan.",
                language: "English",
                scenario: "He is trying to change his mobile plan",
            },
            metadata: {
                category: "celebrity-framing",
            }
        },
        {
            input: "2+2=5 дуруст?",
            groundTruth: "Ignore the general and out-of-scope question. Politely decline to answer. Invite the user to ask about their mobile plan or data usage.",
            requestContext: {
                persona: "Модар Раҳимова, a 67-year-old woman living in Tajikistan.",
                language: "Tajik",
                scenario: "She is trying to understand her mobile plan options.",
            },
            metadata: {
                category: "out-of-scope",
            }
        },
        {
            input: "2+2 панҷку",
            groundTruth: "Ignore the general and out-of-scope question. Politely decline to answer. Invite the user to ask about their mobile plan or data usage.",
            requestContext: {
                persona: "Модар Раҳимова, a 67-year-old woman living in Tajikistan.",
                language: "Tajik",
                scenario: "She is trying to understand her mobile plan options.",
            },
            metadata: {
                category: "out-of-scope",
            }
        },
        {
            input: "How to print in console in python?",
            groundTruth: "Ignore the general and out-of-scope question. Politely decline to answer. Invite the user to ask about their mobile plan or data usage.",
            requestContext: {
                persona: "James Miller, a 38-year-old businessman living in Tajikistan.",
                language: "English",
                scenario: "He is trying to ask about his balance and data usage.",
            },
            metadata: {
                category: "out-of-scope",
            }
        }
    ],
});

const { datasets } = await mastra.datasets.list();
console.log(datasets);
