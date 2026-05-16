import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getUserById, updateUser } from '../data/users.js'
import {
  endSession,
  getLongTermMemory,
  recordPresentedOffer,
} from '../memory/longTerm.js'
import {
  getCancellationState,
  isInCancellationFlow,
  setCancellationState,
} from '../agents/cancellation.js'
import { logger } from '../utils/logger.js'
import { err, ok, toUserId, userIdInput } from './common.js'

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

type OfferKind = 'percent_discount' | 'bonus_data' | 'account_credit'

interface OfferDefinition {
  offerId: string
  kind: OfferKind
  description: string
  durationMonths: number
  percent?: number       // for percent_discount
  bonusGB?: number       // for bonus_data
  creditSomoni?: number  // for account_credit
}

const OFFER_CATALOG: OfferDefinition[] = [
  {
    offerId: 'RET-20PCT-3M',
    kind: 'percent_discount',
    description: '20% off your monthly fee for 3 months',
    durationMonths: 3,
    percent: 20,
  },
  {
    offerId: 'RET-FREE-DATA-10',
    kind: 'bonus_data',
    description: 'Free 10 GB data top-up, valid for 1 month',
    durationMonths: 1,
    bonusGB: 10,
  },
  {
    offerId: 'RET-LOYALTY-50',
    kind: 'account_credit',
    description: '50 TJS loyalty credit applied to your account',
    durationMonths: 0,
    creditSomoni: 50,
  },
]

function savingSomoniFor(offer: OfferDefinition, monthlyFee: number): number {
  switch (offer.kind) {
    case 'percent_discount':
      return Math.round(((offer.percent ?? 0) / 100) * monthlyFee * offer.durationMonths)
    case 'bonus_data':
      return 55 // matches the 10 GB add-on price; keeps savings honest with the catalogue
    case 'account_credit':
      return offer.creditSomoni ?? 0
  }
}

const offerViewSchema = z.object({
  offerId: z.string(),
  description: z.string(),
  savingSomoni: z.number(),
  durationMonths: z.number(),
})

export const getRetentionOffers = createTool({
  id: 'getRetentionOffers',
  description:
    "Fetch personalised retention offers for a user (discount, bonus data, or loyalty credit) — ordered best-first by savings. Filters out any offer already in long-term memory's offersShown. Call this during the cancellation flow after the user has stated their reason, or proactively for high churn-risk users asking about price. NEVER invent offer descriptions or amounts.",
  inputSchema: z.object({
    userId: userIdInput,
  }),
  outputSchema: toolResultSchema(z.array(offerViewSchema)),
  execute: async ({ userId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'getRetentionOffers', userId: id })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)

    const memory = await getLongTermMemory(id)
    const alreadyShown = new Set(memory?.offersShown ?? [])
    const onUnlimited = user.dataLimitGB === -1

    const eligible = OFFER_CATALOG.filter((offer) => {
      if (alreadyShown.has(offer.offerId)) return false
      if (offer.kind === 'bonus_data' && onUnlimited) return false
      if (offer.kind === 'account_credit' && user.churnRisk !== 'high') return false
      return true
    })

    const view = eligible
      .map((offer) => ({
        offerId: offer.offerId,
        description: offer.description,
        savingSomoni: savingSomoniFor(offer, user.monthlyFee),
        durationMonths: offer.durationMonths,
      }))
      .sort((a, b) => b.savingSomoni - a.savingSomoni)

    // Bridge INIT → REASON_ASKED → OFFER_PRESENTED so retention works even if
    // the model didn't pre-call any state-tracking helper. If the prior state
    // is OFFER_DECLINED (re-offering after decline), this is a no-op — we keep
    // moving forward through the FSM in advance helpers.
    const current = await getCancellationState(id)
    if (current === 'INIT') await setCancellationState(id, 'REASON_ASKED')
    if ((await getCancellationState(id)) === 'REASON_ASKED') {
      await setCancellationState(id, 'OFFER_PRESENTED')
    }

    for (const offer of view) {
      await recordPresentedOffer(id, offer.offerId)
    }

    return ok(view)
  },
})

export const applyDiscount = createTool({
  id: 'applyDiscount',
  description:
    'Apply a specific retention offer to a user (by offerId from getRetentionOffers). Only call after the user explicitly accepts the offer. Updates monthly fee, data limit, or balance depending on the offer kind, and records the offer in long-term memory so it is never re-offered.',
  inputSchema: z.object({
    userId: userIdInput,
    offerId: z.string(),
  }),
  outputSchema: toolResultSchema(
    z.object({
      offerId: z.string(),
      kind: z.enum(['percent_discount', 'bonus_data', 'account_credit']),
      previousMonthlyFee: z.number(),
      newMonthlyFee: z.number(),
      newBalance: z.number(),
      newDataLimitGB: z.number(),
      validUntil: z.string().describe('ISO 8601 date. For account credit, equal to the application date.'),
    }),
  ),
  execute: async ({ userId, offerId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'applyDiscount', userId: id, offerId })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const offer = OFFER_CATALOG.find((o) => o.offerId === offerId)
    if (!offer) return err(`Unknown offer id: ${offerId}`)

    const previousMonthlyFee = user.monthlyFee
    let newMonthlyFee = previousMonthlyFee
    let newDataLimitGB = user.dataLimitGB
    let newBalance = user.balance
    let newPaymentStatus = user.paymentStatus
    let validUntil = new Date()

    switch (offer.kind) {
      case 'percent_discount': {
        newMonthlyFee = Math.round(previousMonthlyFee * (1 - (offer.percent ?? 0) / 100))
        validUntil = new Date()
        validUntil.setUTCMonth(validUntil.getUTCMonth() + offer.durationMonths)
        break
      }
      case 'bonus_data': {
        if (user.dataLimitGB !== -1) newDataLimitGB = user.dataLimitGB + (offer.bonusGB ?? 0)
        validUntil = new Date()
        validUntil.setUTCMonth(validUntil.getUTCMonth() + offer.durationMonths)
        break
      }
      case 'account_credit': {
        newBalance = user.balance + (offer.creditSomoni ?? 0)
        if (user.paymentStatus === 'overdue' && newBalance >= 0) newPaymentStatus = 'paid'
        break
      }
    }

    await updateUser(id, {
      monthlyFee: newMonthlyFee,
      dataLimitGB: newDataLimitGB,
      balance: newBalance,
      paymentStatus: newPaymentStatus,
    })
    await recordPresentedOffer(id, offerId)

    if (await isInCancellationFlow(id)) {
      await endSession(id, {
        scenario: 'retention',
        resolutionType: 'self-served',
        satisfactionSignal: 'positive',
        summary: `Cancellation averted — applied ${offerId} (${offer.description}).`,
      })
    }

    return ok({
      offerId,
      kind: offer.kind,
      previousMonthlyFee,
      newMonthlyFee,
      newBalance,
      newDataLimitGB,
      validUntil: validUntil.toISOString().slice(0, 10),
    })
  },
})

