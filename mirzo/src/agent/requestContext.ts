// Minimal get/set bag matching the shape tools and the system prompt read
// (ctx.requestContext.get(...)) — see MASTRA.md §3. Constructed fresh per
// Telegram turn in src/telegram/adapter.ts.
export interface RequestContext {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export function createRequestContext(values: Record<string, unknown>): RequestContext {
  const map = new Map(Object.entries(values));
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
  };
}
