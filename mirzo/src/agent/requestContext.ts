import { RequestContext } from '@mastra/core/request-context';

export type { RequestContext };

// Thin convenience wrapper around Mastra's real RequestContext class
// (verified against the published .d.ts — this replaced an earlier
// hand-rolled {get, set} stand-in whose shape was a guess). Used directly by
// every eval case (src/eval/context.ts); on the Telegram side, the
// framework provides its own RequestContext per message instead (see
// src/telegram/handlers.ts, MASTRA.md §8).
export function createRequestContext(values: Record<string, unknown>): RequestContext {
  return new RequestContext(Object.entries(values));
}
