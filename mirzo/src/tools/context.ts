import crypto from 'node:crypto';

// Session values the Telegram adapter sets on requestContext before every
// agent turn (SPEC.md §14.6): customerId (once linked) and a per-turn
// traceId (SPEC.md §4.9).
export interface ToolCtx {
  requestContext?: {
    get?: (key: string) => unknown;
    set?: (key: string, value: unknown) => void;
  };
}

export function sessionCustomerId(ctx: ToolCtx): string | undefined {
  return ctx.requestContext?.get?.('customerId') as string | undefined;
}

export function traceId(ctx: ToolCtx): string {
  return (ctx.requestContext?.get?.('traceId') as string) ?? crypto.randomUUID();
}
