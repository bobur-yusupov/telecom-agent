const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
type Level = keyof typeof LEVELS

const configured = (process.env.LOG_LEVEL ?? 'info') as Level
const threshold = LEVELS[configured] ?? LEVELS.info

type LogEvent =
  | 'turn.start'
  | 'turn.end'
  | 'tool.call'
  | 'tool.error'
  | 'kb.retrieve'
  | 'agent.escalate'

interface LogEntry {
  event: LogEvent
  chatId?: number
  userId?: number
  scenario?: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention'
  toolName?: string
  durationMs?: number
  error?: { message: string; stack?: string }
  [key: string]: unknown
}

function log(level: Level, entry: LogEntry) {
  if (LEVELS[level] < threshold) return
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, ...entry }) + '\n')
}

export const logger = {
  debug: (entry: LogEntry) => log('debug', entry),
  info: (entry: LogEntry) => log('info', entry),
  warn: (entry: LogEntry) => log('warn', entry),
  error: (entry: LogEntry) => log('error', entry),
}
