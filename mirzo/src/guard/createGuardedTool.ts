import crypto from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { and, eq, isNull } from 'drizzle-orm';
import { z, type ZodRawShape } from 'zod';
import { db } from '../db/client.js';
import { logAudit } from '../db/audit.js';
import { auditLog, idempotencyKeys, pendingActions, tickets } from '../db/schema.js';
import { sessionCustomerId, traceId, type ToolCtx } from '../tools/context.js';

const TOKEN_TTL_MS = 120_000;

// SPEC.md §4.8's `args_hash` — sha256 of the args with object keys sorted, so
// key order in the two calls (propose, then confirm) never causes a spurious
// mismatch.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

function hashArgs(args: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(sortKeys(args))).digest('hex');
}

const audit = logAudit;

// Alias kept for readability within this file; same shape as ToolCtx.
export type GuardCtx = ToolCtx;

export type Precondition = { ok: true } | { ok: false; code: string; message: string };

export interface GuardedToolConfig<Args extends ZodRawShape, Result> {
  name: string;
  description: string;
  schema: z.ZodObject<Args>;
  preconditions: (args: z.infer<z.ZodObject<Args>>, ctx: GuardCtx) => Promise<Precondition>;
  summarize: (args: z.infer<z.ZodObject<Args>>, ctx: GuardCtx) => string;
  commit: (args: z.infer<z.ZodObject<Args>>, ctx: GuardCtx, tx: typeof db) => Promise<Result>;
  sensor: (args: z.infer<z.ZodObject<Args>>, ctx: GuardCtx, result: Result) => Promise<boolean>;
}

// SPEC.md §6 — the confirmation guard. Token handling, auditing, idempotency,
// and verification are all here; tool authors only write preconditions,
// summarize, commit, and a sensor (§6.7).
export function createGuardedTool<Args extends ZodRawShape, Result>(config: GuardedToolConfig<Args, Result>) {
  const inputSchema = config.schema.extend({ token: z.string().uuid().optional() });

  return createTool({
    id: config.name,
    description: config.description,
    inputSchema,
    execute: async (rawArgs: Record<string, unknown>, ctx: GuardCtx) => {
      const { token, ...args } = rawArgs as { token?: string } & Record<string, unknown>;
      const trace = traceId(ctx);
      const customerId = sessionCustomerId(ctx);
      const argsHash = hashArgs(args);

      // ---------------------------------------------------- redemption ----
      if (token) {
        const pending = await db.query.pendingActions.findFirst({ where: eq(pendingActions.token, token) });

        if (!pending) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'INVALID_TOKEN' });
          return { ok: false, code: 'INVALID_TOKEN', message: 'This confirmation is no longer valid. Please start over.' };
        }

        // §6.3: a token that's already consumed is always TOKEN_ALREADY_USED —
        // no silent replay, even though idempotency_keys (below) records the
        // original result for audit/observability purposes.
        if (pending.consumedAt) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'TOKEN_ALREADY_USED' });
          return { ok: false, code: 'TOKEN_ALREADY_USED', message: 'This confirmation has already been used.' };
        }

        if (pending.expiresAt.getTime() < Date.now()) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'TOKEN_EXPIRED' });
          return { ok: false, code: 'TOKEN_EXPIRED', message: 'This confirmation has expired. Please ask again.' };
        }

        if (pending.argsHash !== argsHash) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'ARGS_MISMATCH' });
          return { ok: false, code: 'ARGS_MISMATCH', message: 'This confirmation does not match the requested action.' };
        }

        if (!customerId || pending.customerId !== customerId) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'CUSTOMER_MISMATCH' });
          return { ok: false, code: 'CUSTOMER_MISMATCH', message: 'This confirmation does not belong to this conversation.' };
        }

        // ---- mutation: one transaction is the rollback boundary (§6.4) ----
        let commitResult: Result;
        try {
          commitResult = await db.transaction(async (tx) => {
            // atomic claim — guards against a concurrent redemption of the same token
            const claimed = await tx
              .update(pendingActions)
              .set({ consumedAt: new Date() })
              .where(and(eq(pendingActions.token, token), isNull(pendingActions.consumedAt)))
              .returning();
            if (claimed.length === 0) throw new Error('TOKEN_ALREADY_USED');

            const result = await config.commit(args as never, ctx, tx as unknown as typeof db);
            await tx.insert(auditLog).values({
              traceId: trace,
              customerId,
              toolName: config.name,
              outcome: 'committed',
              args: args as object,
              result: result as object,
            });
            await tx.insert(idempotencyKeys).values({
              key: token,
              toolName: config.name,
              result: { ok: true, verified: true, result } as object,
            });
            return result;
          });
        } catch (err) {
          // same token claimed concurrently between our read above and the
          // atomic UPDATE — single mutation guaranteed either way (§10.4 case 18)
          if (err instanceof Error && err.message === 'TOKEN_ALREADY_USED') {
            await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: 'TOKEN_ALREADY_USED' });
            return { ok: false, code: 'TOKEN_ALREADY_USED', message: 'This confirmation has already been used.' };
          }
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: `COMMIT_ERROR: ${String(err)}` });
          return { ok: false, code: 'COMMIT_ERROR', message: 'Something went wrong performing this action. Nothing was changed.' };
        }

        // ---- verification, independent of the transaction (§6.5, §7) ----
        const verified = await config.sensor(args as never, ctx, commitResult);
        if (verified) {
          await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'verified', args, result: commitResult as object });
          return { ok: true, verified: true, result: commitResult };
        }
        await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'verify_failed', args, result: commitResult as object });
        await db.insert(tickets).values({
          customerId: customerId!,
          category: 'authorization',
          summary: `Verification failed after ${config.name} committed. Manual reconciliation needed.`,
          status: 'open',
        });
        return { ok: false, code: 'VERIFY_FAILED', message: 'This could not be confirmed as successful. A specialist has been notified.' };
      }

      // ------------------------------------------------------- proposal ----
      const pre = await config.preconditions(args as never, ctx);
      if (!pre.ok) {
        await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'rejected', args, rejectReason: pre.code });
        return { ok: false, code: pre.code, message: pre.message };
      }

      const newToken = crypto.randomUUID();
      await db.insert(pendingActions).values({
        token: newToken,
        customerId: customerId!,
        toolName: config.name,
        argsHash,
        argsSnapshot: args as object,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      });
      const summary = config.summarize(args as never, ctx);
      await audit({ traceId: trace, customerId, toolName: config.name, outcome: 'proposed', args, result: { token: newToken, summary } });
      return { ok: true, proposed: true, token: newToken, summary };
    },
  });
}
