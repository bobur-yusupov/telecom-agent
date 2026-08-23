import { Agent } from '@mastra/core/agent';
import { tools } from '../tools/index.js';
import { memory } from './memory.js';
import { buildSystemPrompt, type PromptRequestContext } from './systemPrompt.js';

export const mirzo = new Agent({
  id: 'mirzo',
  name: 'Mirzo',
  description: 'NovaTel customer service agent — billing, plan changes, technical support, cancellations.',
  instructions: ({ requestContext }: { requestContext?: PromptRequestContext }) => buildSystemPrompt(requestContext),
  model: 'deepseek/deepseek-chat',
  tools,
  skills: [
    './src/skills/billing-dispute-resolution',
    './src/skills/plan-change-eligibility',
    './src/skills/retention-playbook',
  ],
  memory,
});
