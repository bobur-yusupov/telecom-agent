import { db } from './client.js';
import { auditLog } from './schema.js';

export type AuditOutcome = 'read' | 'proposed' | 'committed' | 'verified' | 'rejected' | 'verify_failed';

// SPEC.md §4.9 — every tool call writes exactly one row here at minimum.
export async function logAudit(entry: {
  traceId: string;
  customerId?: string | null;
  toolName: string;
  outcome: AuditOutcome;
  args?: unknown;
  result?: unknown;
  rejectReason?: string;
}) {
  await db.insert(auditLog).values({
    traceId: entry.traceId,
    customerId: entry.customerId ?? null,
    toolName: entry.toolName,
    outcome: entry.outcome,
    args: (entry.args ?? null) as object | null,
    result: (entry.result ?? null) as object | null,
    rejectReason: entry.rejectReason ?? null,
  });
}
