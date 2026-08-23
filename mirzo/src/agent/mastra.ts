import { Mastra } from '@mastra/core';
import { mirzo } from './mirzo.js';
import { store } from './memory.js';

// MASTRA.md §9 — `mastra dev` starts Studio (localhost:4111) against this
// registry; not required in production, useful for exercising the agent
// directly during development.
export const mastra = new Mastra({
  agents: { mirzo },
  storage: store,
});
