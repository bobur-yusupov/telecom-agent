import { z } from 'zod'

export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data }
}

export function err<T>(error: string): ToolResult<T> {
  return { success: false, error }
}

// Some smaller open models (Llama, Qwen) inconsistently serialise integer IDs
// as strings. We accept both at the schema level so Mastra's tool-call
// validation passes; downstream code normalises with `toUserId`.
export const userIdInput = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/),
])

export type UserIdInput = z.infer<typeof userIdInput>

export function toUserId(v: UserIdInput): number {
  return typeof v === 'string' ? parseInt(v, 10) : v
}
