import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getPool } from '../src/db/client.js'
import { handleTurn } from '../src/runtime/runtime.js'
import { resolveUserId } from '../src/runtime/identity.js'
import {
  GREETING,
  handleOnboardingReply,
  isOnboarding,
  startOnboarding,
} from '../src/runtime/onboarding.js'
import { normaliseMobileNumber } from '../src/utils/phone.js'
import { purchaseAddon } from '../src/tools/plans.js'
import { getUserById, updateUser } from '../src/data/users.js'
import type { ChannelContext, InboundMessage, OutboundMessage } from '../src/runtime/types.js'

type ToolResult<T> = { success: true; data: T } | { success: false; error: string }
const runTool = <T>(tool: { execute?: unknown }, input: unknown): Promise<ToolResult<T>> =>
  (tool.execute as (i: unknown) => Promise<ToolResult<T>>)(input)

// All test rows are namespaced so cleanup never touches seeded data.
const CHANNEL = 'test'
const PERSONA2_NUMBER = '902222222' // seeds/users.ts → user id 2 (Tajik)

// Fast debounce so tests don't wait the production 2.5s window.
process.env.TURN_DEBOUNCE_MS = '40'

/** A channel stub that records everything the runtime sends. */
function capture(): { ctx: ChannelContext; sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = []
  return {
    sent,
    ctx: { send: async (messages) => void sent.push(...messages) },
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cleanup(): Promise<void> {
  const pool = getPool()
  await pool.query(`DELETE FROM app.channel_identities WHERE channel = $1`, [CHANNEL])
  await pool.query(`DELETE FROM app.onboarding_states WHERE conversation_id LIKE 'test:%'`)
}

beforeEach(cleanup)
afterAll(cleanup)

function inbound(over: Partial<InboundMessage> & { conversationId: string }): InboundMessage {
  return {
    channel: CHANNEL,
    externalUserId: over.externalUserId ?? over.conversationId,
    text: 'text' in over ? (over.text ?? null) : 'hello',
    ...over,
  }
}

describe('phone normalisation', () => {
  it('accepts the documented formats and rejects junk', () => {
    expect(normaliseMobileNumber('902222222')).toBe('902222222')
    expect(normaliseMobileNumber('+992902222222')).toBe('902222222')
    expect(normaliseMobileNumber('992902222222')).toBe('902222222')
    expect(normaliseMobileNumber('0902222222')).toBe('902222222')
    expect(normaliseMobileNumber('12345')).toBeNull()
    expect(normaliseMobileNumber('not a number')).toBeNull()
  })
})

describe('onboarding (SCEN-00)', () => {
  it('greets an unknown user on first contact', async () => {
    const { ctx, sent } = capture()
    const msg = inbound({ conversationId: 'test:greet', externalUserId: 'test-greet', text: 'hi' })
    await handleTurn(msg, ctx)
    await delay(120) // first text is buffered too, so wait for the debounce flush
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toBe(GREETING)
    expect(await isOnboarding(msg.conversationId)).toBe(true)
  })

  it('binds identity on a valid, known number', async () => {
    await startOnboarding('test:ok')
    const result = await handleOnboardingReply('test', 'test-ok', 'test:ok', `+992${PERSONA2_NUMBER}`)
    expect(result.boundUserId).toBe(2)
    expect(result.escalated).toBeUndefined()
    expect(await resolveUserId('test', 'test-ok')).toBe(2)
    expect(await isOnboarding('test:ok')).toBe(false) // state cleared on success
  })

  it('escalates after 3 failed attempts (invalid or unknown)', async () => {
    await startOnboarding('test:fail')
    const r1 = await handleOnboardingReply('test', 'test-fail', 'test:fail', 'garbage')
    const r2 = await handleOnboardingReply('test', 'test-fail', 'test:fail', '999999999') // valid format, unknown
    const r3 = await handleOnboardingReply('test', 'test-fail', 'test:fail', 'garbage')
    expect(r1.escalated).toBeFalsy()
    expect(r2.escalated).toBeFalsy()
    expect(r3.escalated).toBe(true)
    expect(await isOnboarding('test:fail')).toBe(false) // state cleared after escalation
  })
})

describe('purchaseAddon (add data to user)', () => {
  const USER = 1 // persona #1 — finite plan (50 GB), positive balance

  it('credits data, charges balance, and tolerates a paraphrased addon id', async () => {
    const before = await getUserById(USER)
    if (!before) throw new Error('seed user 3 missing')
    try {
      const result = await runTool<{
        addonId: string
        addedGB: number
        chargedSomoni: number
        newDataLimitGB: number
        newBalanceSomoni: number
      }>(purchaseAddon, { userId: USER, addonId: '3gb_pack' }) // intentionally non-canonical

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.addonId).toBe('data_3gb') // resolved to the real id
      expect(result.data.addedGB).toBe(3)
      expect(result.data.chargedSomoni).toBe(20)
      expect(result.data.newDataLimitGB).toBe(before.dataLimitGB + 3)
      expect(result.data.newBalanceSomoni).toBeCloseTo(before.balance - 20, 2)

      const after = await getUserById(USER)
      expect(after?.dataLimitGB).toBe(before.dataLimitGB + 3)
      expect(after?.balance).toBeCloseTo(before.balance - 20, 2)
    } finally {
      await updateUser(USER, { dataLimitGB: before.dataLimitGB, balance: before.balance })
    }
  })

  it('refuses the purchase when the balance is too low', async () => {
    const before = await getUserById(USER)
    if (!before) throw new Error('seed user 3 missing')
    try {
      await updateUser(USER, { balance: 1 })
      const result = await runTool(purchaseAddon, { userId: USER, addonId: 'data_3gb' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/insufficient/i)
      const after = await getUserById(USER)
      expect(after?.dataLimitGB).toBe(before.dataLimitGB) // unchanged on failure
    } finally {
      await updateUser(USER, { dataLimitGB: before.dataLimitGB, balance: before.balance })
    }
  })
})

describe('runtime lifecycle', () => {
  it('rejects non-text content immediately without advancing state', async () => {
    const { ctx, sent } = capture()
    const msg = inbound({ conversationId: 'test:nontext', externalUserId: 'test-nontext', text: null })
    await handleTurn(msg, ctx)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toMatch(/only read text/i)
    expect(await isOnboarding(msg.conversationId)).toBe(false) // no onboarding started
  })

  it('coalesces rapid partial messages into one reply', async () => {
    const { ctx, sent } = capture()
    const frag = (text: string) =>
      inbound({ conversationId: 'test:coalesce', externalUserId: 'test-coalesce', text })
    // Two fragments of one thought arrive faster than the debounce window.
    await handleTurn(frag('manga 1Gb'), ctx)
    await handleTurn(frag('narxi'), ctx)
    await delay(120) // let the debounce window elapse and the turn flush

    // Unknown user → exactly one greeting for the whole burst, not one per fragment.
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toBe(GREETING)
  })
})
