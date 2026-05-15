import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  getUserById,
  getUserByMobileNumber,
  type UserPreferences,
  type UserProfile,
} from '../data/users.js'
import { normaliseMobileNumber } from '../utils/phone.js'
import { logger } from '../utils/logger.js'
import { err, ok, toUserId, userIdInput } from './common.js'

const languageEnum = z.enum(['uz', 'tj', 'ru', 'en'])

const userPreferencesSchema = z.object({
  language: languageEnum,
  responseLength: z.enum(['short', 'detailed']),
  communicationStyle: z.enum(['formal', 'casual']),
  topupReminderEnabled: z.boolean(),
  lowBalanceThreshold: z.number(),
  preferredPaymentMethod: z.string().nullable(),
  lastKnownIssue: z.string().nullable(),
})

const userProfileViewSchema = z.object({
  id: z.number(),
  telegramId: z.number(),
  name: z.string(),
  persona: z.string(),
  age: z.number(),
  language: languageEnum,
  region: z.string(),
  plan: z.string(),
  monthlyFee: z.number(),
  dataUsedGB: z.number(),
  dataLimitGB: z.number(),
  balance: z.number(),
  nextBillDate: z.string(),
  lastInvoiceAmount: z.number(),
  paymentStatus: z.enum(['paid', 'overdue', 'pending']),
  churnRisk: z.enum(['low', 'medium', 'high']),
  openTickets: z.number(),
  deviceType: z.string(),
  preferences: userPreferencesSchema,
})

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

function toProfileView(user: UserProfile) {
  const { interactionHistory: _omitHistory, mobileNumber: _omitNumber, ...view } = user
  return view
}

export const getUserProfileById = createTool({
  id: 'getUserProfileById',
  description:
    'Look up a NovaTel customer by internal user ID. Returns the full profile (plan, balance, data usage, language, churn risk, preferences). Use this when the bot already knows the user from their Telegram session.',
  inputSchema: z.object({
    userId: userIdInput.describe('Internal NovaTel user ID'),
  }),
  outputSchema: toolResultSchema(userProfileViewSchema),
  execute: async ({ userId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'getUserProfileById', userId: id })
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    return ok(toProfileView(user))
  },
})

export const getUserProfileByNumber = createTool({
  id: 'getUserProfileByNumber',
  description:
    'Look up a NovaTel customer by mobile number. Accepts any common Tajikistan format (9 digits, +992 prefix, leading 0). Use this when the user provides their phone number for identification.',
  inputSchema: z.object({
    mobileNumber: z
      .string()
      .min(1)
      .describe('Mobile number in any common format, e.g. 987654321 or +992987654321'),
  }),
  outputSchema: toolResultSchema(userProfileViewSchema),
  execute: async ({ mobileNumber }) => {
    logger.info({ event: 'tool.call', toolName: 'getUserProfileByNumber', mobileNumber })
    const normalised = normaliseMobileNumber(mobileNumber)
    if (!normalised) return err(`Invalid mobile number: ${mobileNumber}`)
    const user = getUserByMobileNumber(normalised)
    if (!user) return err(`No user found for mobile number ${normalised}`)
    return ok(toProfileView(user))
  },
})

const updatablePreferencesSchema = userPreferencesSchema.partial()

export const updateUserPreferences = createTool({
  id: 'updateUserPreferences',
  description:
    'Update one or more preference fields on a user profile (language, response length, communication style, top-up reminders, low-balance threshold, preferred payment method, last known issue). Only include fields you want to change.',
  inputSchema: z.object({
    userId: userIdInput,
    updates: updatablePreferencesSchema,
  }),
  outputSchema: toolResultSchema(userPreferencesSchema),
  execute: async ({ userId, updates }) => {
    const id = toUserId(userId)
    logger.info({
      event: 'tool.call',
      toolName: 'updateUserPreferences',
      userId: id,
      keys: Object.keys(updates),
    })
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const defined = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    ) as Partial<UserPreferences>
    const next: UserPreferences = { ...user.preferences, ...defined }
    user.preferences = next
    return ok(next)
  },
})
