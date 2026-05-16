import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getUserById, updateUser } from '../data/users.js'
import { getPlanById } from '../data/plans.js'
import { logger } from '../utils/logger.js'
import { err, ok, toUserId, userIdInput } from './common.js'

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

export const getBalance = createTool({
  id: 'getBalance',
  description:
    "Look up the user's current account balance in Tajikistani Somoni (TJS). Returns balance and a low-balance warning flag (true when balance is at or below the user's configured low-balance threshold). Call this whenever the user asks about their balance, top-ups, or whether they have enough credit.",
  inputSchema: z.object({
    userId: userIdInput,
  }),
  outputSchema: toolResultSchema(
    z.object({
      balance: z.number().describe('Current balance in TJS. Negative means overdue.'),
      currency: z.literal('TJS'),
      lowBalanceWarning: z.boolean(),
      threshold: z.number(),
    }),
  ),
  execute: async ({ userId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'getBalance', userId: id })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const threshold = user.preferences.lowBalanceThreshold
    return ok({
      balance: user.balance,
      currency: 'TJS' as const,
      lowBalanceWarning: user.balance <= threshold,
      threshold,
    })
  },
})

function previousBillingPeriod(nextBillDate: string): { period: string; month: number; year: number } {
  const next = new Date(nextBillDate)
  const prev = new Date(next.getUTCFullYear(), next.getUTCMonth() - 1, 1)
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return {
    period: `${monthNames[prev.getUTCMonth()]} ${prev.getUTCFullYear()}`,
    month: prev.getUTCMonth() + 1,
    year: prev.getUTCFullYear(),
  }
}

export const getInvoice = createTool({
  id: 'getInvoice',
  description:
    "Fetch the user's most recent invoice — invoice ID, billing period, total amount, due date, payment status, and itemised line items. Use this when the user asks about a bill, what they owe, why their charge is what it is, or disputes an amount.",
  inputSchema: z.object({
    userId: userIdInput,
  }),
  outputSchema: toolResultSchema(
    z.object({
      invoiceId: z.string(),
      period: z.string(),
      amount: z.number(),
      currency: z.literal('TJS'),
      status: z.enum(['paid', 'overdue', 'pending']),
      dueDate: z.string().describe('ISO 8601 date'),
      lineItems: z.array(
        z.object({
          description: z.string(),
          amount: z.number(),
        }),
      ),
    }),
  ),
  execute: async ({ userId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'getInvoice', userId: id })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)

    const { period, month, year } = previousBillingPeriod(user.nextBillDate)
    const invoiceId = `INV-${year}-${String(month).padStart(2, '0')}-${String(user.id).padStart(3, '0')}`
    const plan = await getPlanById(user.plan)
    const planName = plan?.name ?? user.plan

    const lineItems: { description: string; amount: number }[] = [
      { description: `${planName} plan — monthly fee`, amount: user.monthlyFee },
    ]
    const extra = user.lastInvoiceAmount - user.monthlyFee
    if (extra > 0) {
      lineItems.push({ description: 'Additional usage / add-ons', amount: extra })
    }

    return ok({
      invoiceId,
      period,
      amount: user.lastInvoiceAmount,
      currency: 'TJS' as const,
      status: user.paymentStatus,
      dueDate: user.nextBillDate,
      lineItems,
    })
  },
})

export const applyCredit = createTool({
  id: 'applyCredit',
  description:
    "Add a top-up (credit) to the user's balance in TJS. Use this only after the user confirms a specific amount they want to apply. Returns the new balance.",
  inputSchema: z.object({
    userId: userIdInput,
    amount: z.number().positive().describe('Top-up amount in TJS. Must be positive.'),
  }),
  outputSchema: toolResultSchema(
    z.object({
      previousBalance: z.number(),
      amountApplied: z.number(),
      newBalance: z.number(),
      currency: z.literal('TJS'),
    }),
  ),
  execute: async ({ userId, amount }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'applyCredit', userId: id, amount })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const previousBalance = user.balance
    const newBalance = previousBalance + amount
    const updates: Parameters<typeof updateUser>[1] = { balance: newBalance }
    if (user.paymentStatus === 'overdue' && newBalance >= 0) updates.paymentStatus = 'paid'
    await updateUser(id, updates)
    return ok({
      previousBalance,
      amountApplied: amount,
      newBalance,
      currency: 'TJS' as const,
    })
  },
})

const paymentMethods = [
  { id: 'alifmobi', name: 'Alifmobi', type: 'mobile_wallet' as const, instructions: 'Open the Alifmobi app → Pay → NovaTel → enter mobile number.' },
  { id: 'esxata', name: 'Esxata Mobile', type: 'mobile_wallet' as const, instructions: 'In Esxata Mobile, choose Mobile Operators → NovaTel.' },
  { id: 'dcpay', name: 'DC Pay', type: 'mobile_wallet' as const, instructions: 'Open DC Pay → Bills → NovaTel.' },
  { id: 'ussd_100', name: 'USSD *100#', type: 'ussd' as const, instructions: 'Dial *100# from your NovaTel SIM and follow the prompts.' },
]

export const getPaymentMethods = createTool({
  id: 'getPaymentMethods',
  description:
    'List the payment methods customers can use to top up their NovaTel account in Tajikistan (Alifmobi, Esxata Mobile, DC Pay, USSD *100#). Use this when the user asks how to pay or top up.',
  inputSchema: z.object({}),
  outputSchema: toolResultSchema(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['mobile_wallet', 'ussd']),
        instructions: z.string(),
      }),
    ),
  ),
  execute: async () => {
    logger.info({ event: 'tool.call', toolName: 'getPaymentMethods' })
    return ok(paymentMethods)
  },
})
