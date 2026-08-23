// SPEC.md §12 — seed data. Three customers, each anchoring one demo beat.

export const planSeeds = [
  { code: 'NOVA_BASIC', name: 'Nova Basic', price: '30.00', dataGb: 5, minutes: 100, sms: 50, tier: 1, active: true },
  { code: 'NOVA_PLUS', name: 'Nova Plus', price: '60.00', dataGb: 10, minutes: 300, sms: 100, tier: 2, active: true },
  { code: 'NOVA_PRO', name: 'Nova Pro', price: '100.00', dataGb: 20, minutes: 1000, sms: 300, tier: 3, active: true },
  { code: 'NOVA_MAX', name: 'Nova Max', price: '150.00', dataGb: 50, minutes: 3000, sms: 1000, tier: 4, active: true },
] as const;

export const addonSeeds = [
  { code: 'NOVA_ROAM', name: 'Roaming Pack', price: '15.00', active: true },
  { code: 'NOVA_STREAM', name: 'Streaming Pack', price: '10.00', active: true },
] as const;

export const outageSeeds = [
  // active outage in Dushanbe, ETA 2h from seed time — checkNetworkStatus demo
  { region: 'Dushanbe', active: true, etaMinutesFromNow: 120 },
] as const;

export const customerSeeds = [
  {
    // §8.1 billing skill: disputed bill, unrecognised mid-cycle add-on
    phone: '+992900000001',
    name: 'Dilnoza',
    language: 'uz' as const,
    status: 'active' as const,
    balance: '70.00',
    tenureMonths: 8,
    planCode: 'NOVA_PLUS',
    cycleStart: '2026-08-01',
    cycleEnd: '2026-08-31',
    changesThisCycle: 0,
    retentionAttempted: false,
    usage: { dataUsedGb: '4.20', minutesUsed: 120, smsUsed: 30, cycleStart: '2026-08-01' },
    addons: [{ addonCode: 'NOVA_STREAM', activatedAt: '2026-08-10T12:00:00Z' }],
    transactions: [
      { type: 'charge', amount: '60.00', description: 'Monthly plan charge — NOVA_PLUS', invoiceMonth: '2026-07-01' },
      { type: 'charge', amount: '60.00', description: 'Monthly plan charge — NOVA_PLUS', invoiceMonth: '2026-08-01' },
      { type: 'addon', amount: '10.00', description: 'Add-on charge — NOVA_STREAM', invoiceMonth: '2026-08-01' },
    ],
  },
  {
    // §8.2 upgrade path: 94% of data allowance on a tier-2 plan
    phone: '+992900000002',
    name: 'Farrukh',
    language: 'en' as const,
    status: 'active' as const,
    balance: '0.00',
    tenureMonths: 14,
    planCode: 'NOVA_PLUS',
    cycleStart: '2026-08-01',
    cycleEnd: '2026-08-31',
    changesThisCycle: 0,
    retentionAttempted: false,
    usage: { dataUsedGb: '9.40', minutesUsed: 210, smsUsed: 40, cycleStart: '2026-08-01' },
    addons: [],
    transactions: [
      { type: 'charge', amount: '60.00', description: 'Monthly plan charge — NOVA_PLUS', invoiceMonth: '2026-08-01' },
    ],
  },
  {
    // §8.3 retention ladder: long tenure, cancellation intent
    phone: '+992900000003',
    name: 'Rustam',
    language: 'uz' as const,
    status: 'active' as const,
    balance: '0.00',
    tenureMonths: 26,
    planCode: 'NOVA_PRO',
    cycleStart: '2026-08-01',
    cycleEnd: '2026-08-31',
    changesThisCycle: 0,
    retentionAttempted: false,
    usage: { dataUsedGb: '6.00', minutesUsed: 300, smsUsed: 50, cycleStart: '2026-08-01' },
    addons: [],
    transactions: [
      { type: 'charge', amount: '100.00', description: 'Monthly plan charge — NOVA_PRO', invoiceMonth: '2026-08-01' },
    ],
  },
] as const;
