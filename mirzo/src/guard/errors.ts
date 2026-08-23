// SPEC.md §6.3 — token validation failure codes, checked in this order.
export type GuardErrorCode =
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_ALREADY_USED'
  | 'TOKEN_EXPIRED'
  | 'ARGS_MISMATCH'
  | 'CUSTOMER_MISMATCH'
  | 'VERIFY_FAILED'
  | 'COMMIT_ERROR';

export type GuardFailure = { ok: false; code: GuardErrorCode | string; message: string };
export type GuardSuccess<T> = { ok: true; verified: true; result: T };
export type GuardProposal = { ok: true; proposed: true; token: string; summary: string };
