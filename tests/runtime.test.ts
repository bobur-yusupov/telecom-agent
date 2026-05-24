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
import type { InboundMessage } from '../src/runtime/types.js'

// All test rows are namespaced so cleanup never touches seeded data.
const CHANNEL = 'test'
const PERSONA2_NUMBER = '902222222' // seeds/users.ts → user id 2 (Tajik)

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
    const msg = inbound({ conversationId: 'test:greet', externalUserId: 'test-greet', text: 'hi' })
    const [reply] = await handleTurn(msg)
    expect(reply.text).toBe(GREETING)
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

describe('runtime lifecycle', () => {
  it('rejects non-text content without advancing state', async () => {
    const msg = inbound({ conversationId: 'test:nontext', externalUserId: 'test-nontext', text: null })
    const [reply] = await handleTurn(msg)
    expect(reply.text).toMatch(/only read text/i)
    expect(await isOnboarding(msg.conversationId)).toBe(false) // no onboarding started
  })

  it('enforces the per-conversation queue cap (max 3 in flight)', async () => {
    // Prologue of handleTurn (count check + increment) runs synchronously, so
    // five concurrent calls deterministically yield two "busy" rejections.
    const fire = () =>
      handleTurn(inbound({ conversationId: 'test:queue', externalUserId: 'test-queue', text: 'hi' }))
    const results = await Promise.all([fire(), fire(), fire(), fire(), fire()])
    const busy = results.filter(([r]) => /still working/i.test(r.text))
    expect(busy.length).toBe(2)
  })
})
