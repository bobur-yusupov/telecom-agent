export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data }
}

export function err<T>(error: string): ToolResult<T> {
  return { success: false, error }
}
