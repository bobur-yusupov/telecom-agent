import { getPool } from '../db/client.js'

export interface UserPreferences {
  language: 'uz' | 'tj' | 'ru' | 'en'
  responseLength: 'short' | 'detailed'
  communicationStyle: 'formal' | 'casual'
  topupReminderEnabled: boolean
  lowBalanceThreshold: number
  preferredPaymentMethod: string | null
  lastKnownIssue: string | null
}

export interface InteractionRecord {
  date: string
  scenario: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention'
  resolved: boolean
  resolutionType: 'self-served' | 'escalated' | 'abandoned'
  ticketId?: string
  planChanged?: string
  discountApplied?: string
}

export interface UserProfile {
  id: number
  telegramId: number
  mobileNumber: string
  name: string
  persona: string
  age: number
  language: 'uz' | 'tj' | 'ru' | 'en'
  region: string
  plan: string
  monthlyFee: number
  dataUsedGB: number
  dataLimitGB: number
  balance: number
  nextBillDate: string
  lastInvoiceAmount: number
  paymentStatus: 'paid' | 'overdue' | 'pending'
  churnRisk: 'low' | 'medium' | 'high'
  openTickets: number
  deviceType: string
  preferences: UserPreferences
  interactionHistory: InteractionRecord[]
}

interface UserRow {
  id: number
  telegram_id: string  // bigint comes back as string from node-postgres
  mobile_number: string
  name: string
  persona: string
  age: number
  language: 'uz' | 'tj' | 'ru' | 'en'
  region: string
  plan: string
  monthly_fee: string
  data_used_gb: string
  data_limit_gb: string
  balance: string
  next_bill_date: Date
  last_invoice_amount: string
  payment_status: 'paid' | 'overdue' | 'pending'
  churn_risk: 'low' | 'medium' | 'high'
  open_tickets: number
  device_type: string
  preferences: UserPreferences
  interaction_history: InteractionRecord[]
}

function rowToProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    mobileNumber: row.mobile_number,
    name: row.name,
    persona: row.persona,
    age: row.age,
    language: row.language,
    region: row.region,
    plan: row.plan,
    monthlyFee: Number(row.monthly_fee),
    dataUsedGB: Number(row.data_used_gb),
    dataLimitGB: Number(row.data_limit_gb),
    balance: Number(row.balance),
    nextBillDate: row.next_bill_date.toISOString().slice(0, 10),
    lastInvoiceAmount: Number(row.last_invoice_amount),
    paymentStatus: row.payment_status,
    churnRisk: row.churn_risk,
    openTickets: row.open_tickets,
    deviceType: row.device_type,
    preferences: row.preferences,
    interactionHistory: row.interaction_history,
  }
}

const SELECT = `
  SELECT id, telegram_id, mobile_number, name, persona, age, language, region,
         plan, monthly_fee, data_used_gb, data_limit_gb, balance, next_bill_date,
         last_invoice_amount, payment_status, churn_risk, open_tickets, device_type,
         preferences, interaction_history
  FROM app.users
`

export async function getUserByTelegramId(telegramId: number): Promise<UserProfile | undefined> {
  const { rows } = await getPool().query<UserRow>(`${SELECT} WHERE telegram_id = $1 LIMIT 1`, [telegramId])
  return rows[0] ? rowToProfile(rows[0]) : undefined
}

export async function getUserById(userId: number): Promise<UserProfile | undefined> {
  const { rows } = await getPool().query<UserRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [userId])
  return rows[0] ? rowToProfile(rows[0]) : undefined
}

export async function getUserByMobileNumber(mobileNumber: string): Promise<UserProfile | undefined> {
  const { rows } = await getPool().query<UserRow>(`${SELECT} WHERE mobile_number = $1 LIMIT 1`, [mobileNumber])
  return rows[0] ? rowToProfile(rows[0]) : undefined
}

export interface UserUpdates {
  plan?: string
  monthlyFee?: number
  dataLimitGB?: number
  dataUsedGB?: number
  balance?: number
  paymentStatus?: 'paid' | 'overdue' | 'pending'
  openTickets?: number
  preferences?: UserPreferences
}

const COLUMN_MAP: Record<keyof UserUpdates, string> = {
  plan: 'plan',
  monthlyFee: 'monthly_fee',
  dataLimitGB: 'data_limit_gb',
  dataUsedGB: 'data_used_gb',
  balance: 'balance',
  paymentStatus: 'payment_status',
  openTickets: 'open_tickets',
  preferences: 'preferences',
}

export async function updateUser(userId: number, updates: UserUpdates): Promise<UserProfile | undefined> {
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue
    const col = COLUMN_MAP[key as keyof UserUpdates]
    sets.push(`${col} = $${i++}`)
    values.push(key === 'preferences' ? JSON.stringify(value) : value)
  }
  if (sets.length === 0) return getUserById(userId)
  values.push(userId)
  await getPool().query(`UPDATE app.users SET ${sets.join(', ')} WHERE id = $${i}`, values)
  return getUserById(userId)
}
