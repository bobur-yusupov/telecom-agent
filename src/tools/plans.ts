import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getAddonById, getPlanById, listAddons, listPlans as listPlansFromDb } from '../data/plans.js'
import { getUserById, updateUser } from '../data/users.js'
import {
  getCancellationState,
  setCancellationState,
} from '../agents/cancellation.js'
import { endSession } from '../memory/longTerm.js'
import { logger } from '../utils/logger.js'
import { err, ok, toUserId, userIdInput } from './common.js'

const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataGB: z.number().describe('Monthly data allowance in GB. -1 means unlimited.'),
  callMinutesExternal: z.number().describe('Monthly minutes for calls to other networks.'),
  callMinutesInternal: z
    .number()
    .describe('Monthly minutes for calls within NovaTel. -1 means unlimited.'),
  priceSomoni: z.number().describe('Monthly fee in Tajikistani Somoni (TJS).'),
})

const addonSchema = z.object({
  id: z.string(),
  dataGB: z.number(),
  priceSomoni: z.number(),
})

function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: z.string() }),
  ])
}

export const listPlans = createTool({
  id: 'listPlans',
  description:
    'List every NovaTel plan currently sold (id, name, data allowance, call minutes, monthly fee). Call this whenever the user asks what plans exist, wants to compare options, or is considering a downgrade/upgrade. NEVER describe plans you have not received from this tool.',
  inputSchema: z.object({}),
  outputSchema: toolResultSchema(z.array(planSchema)),
  execute: async () => {
    logger.info({ event: 'tool.call', toolName: 'listPlans' })
    return ok(await listPlansFromDb())
  },
})

export const comparePlans = createTool({
  id: 'comparePlans',
  description:
    'Return the full details of two or more plans so they can be compared side-by-side. Use this when the user wants to weigh specific plans against each other.',
  inputSchema: z.object({
    planIds: z.array(z.string()).min(2).describe('Plan IDs to compare, e.g. ["connect", "unlimited_pro"]'),
  }),
  outputSchema: toolResultSchema(z.array(planSchema)),
  execute: async ({ planIds }) => {
    logger.info({ event: 'tool.call', toolName: 'comparePlans', planIds })
    const resolved = await Promise.all(planIds.map(async (id) => ({ id, plan: await getPlanById(id) })))
    const missing = resolved.filter((r) => !r.plan).map((r) => r.id)
    if (missing.length > 0) return err(`Unknown plan id(s): ${missing.join(', ')}`)
    return ok(resolved.map((r) => r.plan!))
  },
})

export const changePlan = createTool({
  id: 'changePlan',
  description:
    'Switch a user to a different plan. Only call this AFTER the user has explicitly confirmed the change (e.g. they tapped a confirmation button or said "yes, switch me"). Never call speculatively.',
  inputSchema: z.object({
    userId: userIdInput,
    newPlanId: z.string(),
  }),
  outputSchema: toolResultSchema(
    z.object({
      previousPlanId: z.string(),
      newPlanId: z.string(),
      monthlyFee: z.number(),
      effectiveDate: z.string(),
    }),
  ),
  execute: async ({ userId, newPlanId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'changePlan', userId: id, newPlanId })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const plan = await getPlanById(newPlanId)
    if (!plan) return err(`Unknown plan id: ${newPlanId}`)
    if (user.plan === newPlanId) return err(`User is already on plan ${newPlanId}`)
    const previousPlanId = user.plan
    await updateUser(id, {
      plan: plan.id,
      monthlyFee: plan.priceSomoni,
      dataLimitGB: plan.dataGB,
    })

    // Cancellation save: the user declined the retention offer and is now
    // accepting an alternative plan. Bridge the intermediate FSM states the
    // agent doesn't track explicitly, then close out the session.
    const state = await getCancellationState(id)
    if (state === 'OFFER_PRESENTED' || state === 'OFFER_DECLINED' || state === 'ALTERNATIVE_PRESENTED') {
      if (state === 'OFFER_PRESENTED') await setCancellationState(id, 'OFFER_DECLINED')
      if ((await getCancellationState(id)) === 'OFFER_DECLINED') {
        await setCancellationState(id, 'ALTERNATIVE_PRESENTED')
      }
      await endSession(id, {
        scenario: 'retention',
        resolutionType: 'self-served',
        satisfactionSignal: 'positive',
        previousPlanId,
        summary: `Cancellation averted — switched ${previousPlanId} → ${plan.id}.`,
      })
    }

    return ok({
      previousPlanId,
      newPlanId: plan.id,
      monthlyFee: plan.priceSomoni,
      effectiveDate: user.nextBillDate,
    })
  },
})

export const getDataAddons = createTool({
  id: 'getDataAddons',
  description:
    'List the data add-on packs the user can buy on top of their current plan (one-off data top-ups). NEVER describe add-ons you have not received from this tool.',
  inputSchema: z.object({}),
  outputSchema: toolResultSchema(z.array(addonSchema)),
  execute: async () => {
    logger.info({ event: 'tool.call', toolName: 'getDataAddons' })
    return ok(await listAddons())
  },
})

export const purchaseAddon = createTool({
  id: 'purchaseAddon',
  description:
    'Add a data top-up pack to the user\'s plan. Only call after the user has explicitly confirmed the purchase and the price.',
  inputSchema: z.object({
    userId: userIdInput,
    addonId: z.string(),
  }),
  outputSchema: toolResultSchema(
    z.object({
      addonId: z.string(),
      addedGB: z.number(),
      chargedSomoni: z.number(),
      newDataLimitGB: z.number(),
    }),
  ),
  execute: async ({ userId, addonId }) => {
    const id = toUserId(userId)
    logger.info({ event: 'tool.call', toolName: 'purchaseAddon', userId: id, addonId })
    const user = await getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const addon = await getAddonById(addonId)
    if (!addon) return err(`Unknown addon id: ${addonId}`)
    if (user.dataLimitGB === -1) {
      return err('User is on an unlimited plan; data add-ons are not applicable.')
    }
    const newDataLimitGB = user.dataLimitGB + addon.dataGB
    await updateUser(id, { dataLimitGB: newDataLimitGB })
    return ok({
      addonId: addon.id,
      addedGB: addon.dataGB,
      chargedSomoni: addon.priceSomoni,
      newDataLimitGB,
    })
  },
})
