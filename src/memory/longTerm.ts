export interface LongTermMemory {
  userId: number
  lastInteractionDate: string   // ISO 8601
  totalInteractions: number
  offersShown: string[]         // retention offer IDs already presented
  previousPlans: string[]
  resolvedIssues: string[]      // issue types from createTicket calls
  satisfactionSignals: ('positive' | 'negative' | 'neutral')[]
  summary: string               // 1-2 sentence agent-written recap of last session
}

const store = new Map<number, LongTermMemory>()

export function getLongTermMemory(userId: number): LongTermMemory | undefined {
  return store.get(userId)
}

export function setLongTermMemory(userId: number, memory: LongTermMemory): void {
  store.set(userId, memory)
}

export function updateLongTermMemory(userId: number, patch: Partial<LongTermMemory>): void {
  const existing = store.get(userId) ?? {
    userId,
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    offersShown: [],
    previousPlans: [],
    resolvedIssues: [],
    satisfactionSignals: [],
    summary: '',
  }
  store.set(userId, { ...existing, ...patch })
}
