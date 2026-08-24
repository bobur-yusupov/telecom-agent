import { Mastra } from '@mastra/core';
import { mirzo } from '../agent/mirzo.js';
import { store } from '../agent/memory.js';

// `src/mastra/index.ts` is the conventional location the `mastra` CLI looks
// for this registry. `mastra dev` starts both Studio (localhost:4111) and
// the HTTP server that Telegram channel traffic actually needs (MASTRA.md
// §8) — it is not optional once an agent declares `channels`.
export const mastra = new Mastra({
  agents: { mirzo },
  storage: store,
});
