export interface Plan {
  id: string
  name: string
  dataGB: number   // -1 = unlimited
  callMinutesExternal: number
  callMinutesInternal: number  // -1 = unlimited
  priceSomoni: number
}

export interface DataAddon {
  id: string
  dataGB: number
  priceSomoni: number
}

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

export function getPlanById(id: string): Plan | undefined {
  return plans.find((p) => p.id === id)
}
