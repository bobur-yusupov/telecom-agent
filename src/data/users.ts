// 8 mock personas — see spec/DATA.md for persona rationale.
// TODO: populate full profile values for each persona.

export interface UserPreferences {
  language: 'uz' | 'tj' | 'ru' | 'en'
  responseLength: 'short' | 'detailed'
  communicationStyle: 'formal' | 'casual'
  topupReminderEnabled: boolean
  lowBalanceThreshold: number   // Somoni
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
  mobileNumber: string   // canonical 9-digit form, no country code
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

export const users: UserProfile[] = [
  {
    id: 1,
    telegramId: 100000001,
    mobileNumber: '901111111',
    name: 'Алексей Смирнов',
    persona: 'student',
    age: 21,
    language: 'ru',
    region: 'Dushanbe',
    plan: 'connect',
    monthlyFee: 80,
    dataUsedGB: 22,
    dataLimitGB: 50,
    balance: 45,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 80,
    paymentStatus: 'paid',
    churnRisk: 'low',
    openTickets: 0,
    deviceType: 'Android mid-range',
    preferences: {
      language: 'ru',
      responseLength: 'detailed',
      communicationStyle: 'casual',
      topupReminderEnabled: false,
      lowBalanceThreshold: 10,
      preferredPaymentMethod: 'Alifmobile',
      lastKnownIssue: null,
    },
    interactionHistory: [],
  },
  {
    id: 2,
    telegramId: 100000002,
    mobileNumber: '902222222',
    name: 'Модар Раҳимова',
    persona: 'elderly',
    age: 67,
    language: 'tj',
    region: 'Khujand',
    plan: 'starter',
    monthlyFee: 45,
    dataUsedGB: 2,
    dataLimitGB: 10,
    balance: 18,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 45,
    paymentStatus: 'paid',
    churnRisk: 'medium',
    openTickets: 0,
    deviceType: 'feature phone',
    preferences: {
      language: 'tj',
      responseLength: 'short',
      communicationStyle: 'casual',
      topupReminderEnabled: true,
      lowBalanceThreshold: 20,
      preferredPaymentMethod: null,
      lastKnownIssue: null,
    },
    interactionHistory: [],
  },
  {
    id: 3,
    telegramId: 100000003,
    mobileNumber: '903333333',
    name: 'James Miller',
    persona: 'businessman',
    age: 38,
    language: 'en',
    region: 'Dushanbe',
    plan: 'unlimited_pro',
    monthlyFee: 120,
    dataUsedGB: 60,
    dataLimitGB: -1,  // unlimited
    balance: 200,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 120,
    paymentStatus: 'paid',
    churnRisk: 'low',
    openTickets: 0,
    deviceType: 'iPhone',
    preferences: {
      language: 'en',
      responseLength: 'detailed',
      communicationStyle: 'formal',
      topupReminderEnabled: false,
      lowBalanceThreshold: 50,
      preferredPaymentMethod: 'DC Pay',
      lastKnownIssue: null,
    },
    interactionHistory: [],
  },
  {
    id: 4,
    telegramId: 100000004,
    mobileNumber: '904444444',
    name: 'Давлат Мирзоев',
    persona: 'rural_resident',
    age: 44,
    language: 'tj',
    region: 'Kulob',
    plan: 'starter',
    monthlyFee: 45,
    dataUsedGB: 8,
    dataLimitGB: 10,
    balance: 30,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 45,
    paymentStatus: 'paid',
    churnRisk: 'low',
    openTickets: 1,
    deviceType: 'Android budget',
    preferences: {
      language: 'tj',
      responseLength: 'short',
      communicationStyle: 'casual',
      topupReminderEnabled: true,
      lowBalanceThreshold: 15,
      preferredPaymentMethod: null,
      lastKnownIssue: 'no_signal',
    },
    interactionHistory: [],
  },
  {
    id: 5,
    telegramId: 100000005,
    mobileNumber: '905555555',
    name: 'Наталья Петрова',
    persona: 'frustrated_customer',
    age: 34,
    language: 'ru',
    region: 'Dushanbe',
    plan: 'connect',
    monthlyFee: 80,
    dataUsedGB: 50,
    dataLimitGB: 50,
    balance: -12,
    nextBillDate: '2026-05-15',
    lastInvoiceAmount: 80,
    paymentStatus: 'overdue',
    churnRisk: 'high',
    openTickets: 2,
    deviceType: 'Android mid-range',
    preferences: {
      language: 'ru',
      responseLength: 'short',
      communicationStyle: 'casual',
      topupReminderEnabled: true,
      lowBalanceThreshold: 20,
      preferredPaymentMethod: 'Alifmobile',
      lastKnownIssue: 'slow_internet',
    },
    interactionHistory: [],
  },
  {
    id: 6,
    telegramId: 100000006,
    mobileNumber: '906666666',
    name: 'Бобур Юсупов',
    persona: 'migrant_worker',
    age: 29,
    language: 'uz',
    region: 'Bokhtar',
    plan: 'connect',
    monthlyFee: 80,
    dataUsedGB: 30,
    dataLimitGB: 50,
    balance: 55,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 80,
    paymentStatus: 'paid',
    churnRisk: 'medium',
    openTickets: 0,
    deviceType: 'Android mid-range',
    preferences: {
      language: 'uz',
      responseLength: 'short',
      communicationStyle: 'casual',
      topupReminderEnabled: true,
      lowBalanceThreshold: 20,
      preferredPaymentMethod: null,
      lastKnownIssue: null,
    },
    interactionHistory: [],
  },
  {
    id: 7,
    telegramId: 100000007,
    mobileNumber: '907777777',
    name: 'Ситора Назарова',
    persona: 'low_balance_student',
    age: 19,
    language: 'tj',
    region: 'Istaravshan',
    plan: 'starter',
    monthlyFee: 45,
    dataUsedGB: 9,
    dataLimitGB: 10,
    balance: 8,
    nextBillDate: '2026-06-01',
    lastInvoiceAmount: 45,
    paymentStatus: 'pending',
    churnRisk: 'medium',
    openTickets: 0,
    deviceType: 'Android budget',
    preferences: {
      language: 'tj',
      responseLength: 'short',
      communicationStyle: 'casual',
      topupReminderEnabled: true,
      lowBalanceThreshold: 15,
      preferredPaymentMethod: 'Alifmobile',
      lastKnownIssue: null,
    },
    interactionHistory: [],
  },
]

// Persona #8 (new user) has no entry — unknown telegramId triggers SCEN-00.

const byTelegramId = new Map(users.map((u) => [u.telegramId, u]))
const byId = new Map(users.map((u) => [u.id, u]))
const byMobileNumber = new Map(users.map((u) => [u.mobileNumber, u]))

export function getUserByTelegramId(telegramId: number): UserProfile | undefined {
  return byTelegramId.get(telegramId)
}

export function getUserById(userId: number): UserProfile | undefined {
  return byId.get(userId)
}

export function getUserByMobileNumber(mobileNumber: string): UserProfile | undefined {
  return byMobileNumber.get(mobileNumber)
}
