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
        },
        {
            input: "What is my balance?",
            groundTruth: "Call getBalance tool. Return the exact balance figure. If balance is low, mention it proactively.",
            requestContext: {
                persona: "James Miller, a 38-year-old businessman living in Tajikistan.",
                language: "English",
                scenario: "He is trying to ask about his balance and data usage.",
            },
            metadata: {
                category: "scen-01",
            }
        },
        {
            input: "Чӣ тавр метавонам тарифро иваз карда метавонам?",
            groundTruth: "Call listPlans tool. Present available plans. Ask which one the user wants. Require explicit confirmation before calling changePlan.",
            requestContext: {
                persona: "Модар Раҳимова, a 67-year-old woman living in Tajikistan.",
                language: "Tajik",
                scenario: "She is trying to change her mobile plan.",
            },
            metadata: {
                category: "scen-02",
            }
        },
        {
            input: "Что делать, если у меня проблемы с сетью?",
            groundTruth: "Call checkOutage and runDiagnostic in parallel. If outage active, give ETA. If clean, provide troubleshooting steps. If unresolved, call createTicket.",
            requestContext: {
                persona: "Наталья Петрова, a 34-year-old woman living in Dushanbe.",
                language: "Russian",
                scenario: "She is trying to report a network outage.",
            },
            metadata: {
                category: "scen-03",
            }
        },
        {
            input: "Men o'z tarifimni bekor qilmoqchiman. Qanday qilib buni amalga oshiraman?",
            groundTruth: "Ask why they want to cancel. Do not skip to cancellation immediately. Follow the retention flow in order.",
            requestContext: {
                persona: "Bobur Yusupov, a 29-year-old migrant worker living in Tajikistan.",
                language: "Uzbek",
                scenario: "He is trying to cancel his mobile plan.",
            },
            metadata: {
                category: "scen-04",
            }
        },
        {
            input: "Balansimni ko'rib bera olasizmi?",
            groundTruth: "Call getBalance tool. Return the exact balance figure. If balance is low, mention it proactively. Response must be in Uzbek.",
            requestContext: {
                persona: "Bobur Yusupov, a 29-year-old migrant worker living in Tajikistan.",
                language: "Uzbek",
                scenario: "He is trying to check his balance.",
            },
            metadata: {
                category: "multilingual",
            }
        },
        {
            input: "Интернет ки муаммо шуда истаст. Чӣ кор кунам?",
            groundTruth: "Call checkOutage and runDiagnostic in parallel. If outage active, give ETA. If clean, provide troubleshooting steps. If unresolved, call createTicket.Response must be in Tajik.",
            requestContext: {
                persona: "Давлат Мирзоев from Kulob, Tajikistan.",
                language: "Tajik",
                scenario: "He is trying to report a network outage.",
            },
            metadata: {
                category: "multilingual",
            }
        },
    ],
});

const { datasets } = await mastra.datasets.list();
console.log(datasets);
