import type { DataAddon, Plan } from '../plans.js'

export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    dataGB: 10,
    callMinutesExternal: 50,
    callMinutesInternal: -1,
    priceSomoni: 45,
  },
  {
    id: 'connect',
    name: 'Connect',
    dataGB: 50,
    callMinutesExternal: 100,
    callMinutesInternal: -1,
    priceSomoni: 80,
  },
  {
    id: 'unlimited_pro',
    name: 'Unlimited Pro',
    dataGB: -1,
    callMinutesExternal: 100,
    callMinutesInternal: -1,
    priceSomoni: 120,
  },
]

export const addons: DataAddon[] = [
  { id: 'data_1gb', dataGB: 1, priceSomoni: 8 },
  { id: 'data_3gb', dataGB: 3, priceSomoni: 20 },
  { id: 'data_10gb', dataGB: 10, priceSomoni: 55 },
]
