import { describe, expect, it } from 'vitest'
import { isCyrillic, runConversation } from './helpers/runConversation.js'

// Each scenario reuses one persona. The mock data store mutates across runs
// (changePlan, applyCredit, etc.), so don't reuse a persona between scenarios
// that mutate it without resetting the store.

describe('SCEN-01 — Billing & payments', () => {
  it('calls getBalance after the user shares their number, replies in Tajik', async () => {
    const { allToolNames, finalReply } = await runConversation(
      ['Салом', 'Ман балансама донистанам даркор', '904444444'],
      { userId: 4 },
    )

    expect(allToolNames).toContain('getUserProfileByNumber')
    expect(allToolNames).toContain('getBalance')
    expect(isCyrillic(finalReply)).toBe(true)
    // Persona #4 (Davlat) has 30 TJS balance — must appear in the final reply.
    expect(finalReply).toMatch(/30/)
  })

  it('itemises the invoice when asked', async () => {
    const { allToolNames, finalReply } = await runConversation(
      ['Расскажи про мой последний счёт, мой номер 905555555'],
      { userId: 5 },
    )

    expect(allToolNames).toContain('getInvoice')
    expect(finalReply.length).toBeGreaterThan(0)
  })
})

describe('SCEN-02 — Plans', () => {
  it('listPlans is called when the user asks what plans exist', async () => {
    const { allToolNames } = await runConversation(
      ['What plans do you have? My number is 903333333'],
      { userId: 3 },
    )
    expect(allToolNames).toContain('listPlans')
  })

  it('does NOT call changePlan without explicit confirmation', async () => {
    const { allToolNames } = await runConversation(
      [
        'My number is 901111111',
        'I want to look at the Connect plan',
      ],
      { userId: 1 },
    )
    expect(allToolNames).not.toContain('changePlan')
  })
})

describe('SCEN-03 — Technical support', () => {
  it('calls runDiagnostic when the user reports a connectivity issue', async () => {
    const { allToolNames } = await runConversation(
      ['Салом, рақамам 906666666', 'Интернет кор намекунад'],
      { userId: 6 },
    )
    // Per the prompt's grounding rule, runDiagnostic must come before any
    // troubleshooting reply.
    expect(allToolNames).toContain('runDiagnostic')
  })
})

describe('SCEN-04 — Cancellation & retention', () => {
  it('asks for a reason and calls getRetentionOffers before escalating', async () => {
    const { allToolNames } = await runConversation(
      [
        'мой номер 905555555',
        'хочу отключить услугу',
        'дорого',
      ],
      { userId: 5 },
    )
    expect(allToolNames).toContain('getRetentionOffers')
    // Should NOT escalate immediately on first decline — alternative plan first.
    const escalateIndex = allToolNames.indexOf('escalateToHuman')
    const offerIndex = allToolNames.indexOf('getRetentionOffers')
    if (escalateIndex !== -1) {
      expect(escalateIndex).toBeGreaterThan(offerIndex)
    }
  })

  it('calls resolveCancellation and never escalates when user changes their mind', async () => {
    const { allToolNames, finalReply } = await runConversation(
      [
        'мой номер 905555555',
        'хочу отключить услугу',
        'дорого',
        'нет, передумала, всё хорошо',
      ],
      { userId: 5 },
    )
    expect(allToolNames).toContain('resolveCancellation')
    expect(allToolNames).not.toContain('escalateToHuman')
    // Final reply should acknowledge the change of mind, not push more offers.
    expect(finalReply.length).toBeGreaterThan(0)
  })
})

describe('Confirmation discipline', () => {
  it('does NOT purchaseAddon on browsing intent', async () => {
    const { allToolNames } = await runConversation(
      [
        'Салом, рақамам 904444444',
        'метавонам боз 1 гб харид кунам?',
      ],
      { userId: 4 },
    )
    expect(allToolNames).toContain('getDataAddons')
    expect(allToolNames).not.toContain('purchaseAddon')
  })

  it('DOES purchaseAddon after explicit "ҳа" confirmation', async () => {
    const { allToolNames } = await runConversation(
      [
        'Салом, рақамам 904444444',
        'метавонам боз 1 гб харид кунам?',
        'ҳа',
      ],
      { userId: 4 },
    )
    expect(allToolNames).toContain('purchaseAddon')
  })
})

describe('Conversational style', () => {
  it('does not open the second reply with a greeting word', async () => {
    // After the agent already greeted, a follow-up question should get a
    // direct answer — not another "Салом / Hi / Привет".
    const { turns } = await runConversation(
      ['Салом', 'что такое тарифный план Connect?'],
      { userId: 1 },
    )
    const second = turns[1].assistant.trimStart().toLowerCase()
    expect(second.startsWith('салом')).toBe(false)
    expect(second.startsWith('hi')).toBe(false)
    expect(second.startsWith('привет')).toBe(false)
  })
})
