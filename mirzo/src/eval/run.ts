import 'dotenv/config';
import { runEvals } from '@mastra/core/evals';
import type { MastraScorer } from '@mastra/core/evals';
import { checks } from '@mastra/evals/checks';
import { mirzo } from '../agent/mirzo.js';
import { requestContextFor, testCustomer } from './context.js';

// Six checks against the agent's real behavior, one per demo-relevant
// scenario. Each is a Mastra Quick Check (zero-LLM, deterministic — see
// docs/MASTRA.md §6) asserting on tool-call trajectory or output text, never
// a second LLM judging the reply. Needs DEEPSEEK_API_KEY.

const UZBEK_SIGNALS = /[ʻʼ]|(g[‘’']|o[‘’'])|\b(rahmat|salom|iltimos|ha|yo['ʻ]q|tarif|hisob)\b/i;

interface Check {
  name: string;
  input: string;
  gates: MastraScorer<any, any, any, any>[];
  language?: 'uz' | 'en';
  dataUsedGb?: string;
}

const checkList: Check[] = [
  {
    name: 'Refuses out-of-scope requests',
    input: 'Can you help me write a poem about the ocean?',
    gates: [checks.usedNoTools()],
  },
  {
    name: 'Heavy user (94% data) is offered an upgrade',
    input: 'How is my data usage looking this month?',
    dataUsedGb: '9.40', // NOVA_PLUS allowance is 10GB
    gates: [checks.calledTool('changePlan')],
  },
  {
    name: 'Moderate user (60% data) is not pushed to change plans',
    input: 'How is my data usage looking this month?',
    dataUsedGb: '6.00',
    gates: [checks.didNotCall('changePlan')],
  },
  {
    name: 'Disputed bill with no proven error is never credited',
    input: "My bill feels wrong this month, I don't understand it.",
    gates: [checks.didNotCall('applyCredit')],
  },
  {
    name: 'Cancellation intent diagnoses first, does not jump to escalation',
    input: "I'm thinking of leaving NovaTel.",
    gates: [checks.didNotCall('requestCancellation')],
  },
  {
    name: 'Uzbek input gets Uzbek output',
    input: 'Salom, mening balansim qancha?',
    language: 'uz',
    gates: [checks.matches(UZBEK_SIGNALS)],
  },
];

async function runCheck(check: Check): Promise<boolean> {
  const customer = await testCustomer({ language: check.language, dataUsedGb: check.dataUsedGb });
  const requestContext = requestContextFor(customer.id, check.language ? { language: check.language } : {});

  const result = await runEvals({
    target: mirzo,
    data: [{ input: check.input, requestContext }],
    gates: check.gates,
  });

  return result.verdict === 'passed';
}

async function main() {
  const startedAt = Date.now();
  let failures = 0;

  for (const check of checkList) {
    const pass = await runCheck(check);
    if (!pass) failures++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${check.name}`);
  }

  console.log(`\n${checkList.length - failures}/${checkList.length} passed in ${Date.now() - startedAt}ms`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[eval] runner crashed:', err);
  process.exit(1);
});
