import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { addons, getPlanById, plans } from '../data/plans.js'
import { getUserById } from '../data/users.js'
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
    return ok(plans)
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
    const found = planIds.map((id) => getPlanById(id)).filter((p): p is NonNullable<typeof p> => !!p)
    const missing = planIds.filter((id) => !getPlanById(id))
    if (missing.length > 0) return err(`Unknown plan id(s): ${missing.join(', ')}`)
    return ok(found)
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
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const plan = getPlanById(newPlanId)
    if (!plan) return err(`Unknown plan id: ${newPlanId}`)
    if (user.plan === newPlanId) return err(`User is already on plan ${newPlanId}`)
    const previousPlanId = user.plan
    user.plan = plan.id
    user.monthlyFee = plan.priceSomoni
    user.dataLimitGB = plan.dataGB
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
    return ok(addons)
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
    const user = getUserById(id)
    if (!user) return err(`No user found with id ${id}`)
    const addon = addons.find((a) => a.id === addonId)
    if (!addon) return err(`Unknown addon id: ${addonId}`)
    if (user.dataLimitGB === -1) {
      return err('User is on an unlimited plan; data add-ons are not applicable.')
    }
    user.dataLimitGB += addon.dataGB
    return ok({
      addonId: addon.id,
      addedGB: addon.dataGB,
      chargedSomoni: addon.priceSomoni,
      newDataLimitGB: user.dataLimitGB,
    })
  },
})
