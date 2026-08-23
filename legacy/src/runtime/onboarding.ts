import { getPool } from '../db/client.js'
import { getUserByMobileNumber, type UserProfile } from '../data/users.js'
import { normaliseMobileNumber } from '../utils/phone.js'
import { logger } from '../utils/logger.js'
import { bindIdentity } from './identity.js'

/**
 * Deterministic SCEN-00 onboarding for unknown users. This is orchestration, not
 * LLM work: it normalises the number, enforces the 3-attempt limit, and binds the
 * identity. The agent is only invoked once a user is identified.
 */

const MAX_ATTEMPTS = 3

type Lang = UserProfile['language']

// Shown to a brand-new user before their language is known → all four languages.
export const GREETING = [
  '🇹🇯 Хуш омадед ба NovaTel! Шумораи мобилии худро ворид кунед.',
  '🇷🇺 Добро пожаловать в NovaTel! Введите ваш мобильный номер.',
  "🇺🇿 NovaTel'ga xush kelibsiz! Mobil raqamingizni kiriting.",
  '🇬🇧 Welcome to NovaTel! Please enter your mobile number.',
].join('\n')

const INVALID = [
  '🇹🇯 Рақам нодуруст аст. Лутфан рақами 9-рақамаи мобилии худро ворид кунед.',
  '🇷🇺 Неверный номер. Пожалуйста, введите ваш 9-значный мобильный номер.',
  "🇺🇿 Raqam noto'g'ri. Iltimos, 9 xonali mobil raqamingizni kiriting.",
  '🇬🇧 Invalid number. Please enter your 9-digit mobile number.',
].join('\n')

const NOT_FOUND = [
  '🇹🇯 Рақам ёфт нашуд. Лутфан тафтиш кунед ва дубора кӯшиш кунед.',
  '🇷🇺 Номер не найден. Пожалуйста, проверьте и попробуйте снова.',
  "🇺🇿 Raqam topilmadi. Iltimos, tekshirib qaytadan urinib ko'ring.",
  '🇬🇧 Number not found. Please check and try again.',
].join('\n')

const ESCALATED = [
  '🇹🇯 Мо рақами шуморо тасдиқ карда натавонистем. Ходими дастгирӣ ба шумо дар тамос мешавад.',
  '🇷🇺 Не удалось подтвердить ваш номер. С вами свяжется сотрудник поддержки.',
  "🇺🇿 Raqamingizni tasdiqlay olmadik. Qo'llab-quvvatlash xodimi siz bilan bog'lanadi.",
  '🇬🇧 We could not verify your number. A support agent will reach out to you.',
].join('\n')

const WELCOME_BACK: Record<Lang, string> = {
  tj: 'Профили шумо ёфт шуд. Чӣ гуна кӯмак карда метавонам?',
  ru: 'Я нашёл ваш профиль. Чем могу помочь?',
  uz: 'Profilingiz topildi. Sizga qanday yordam bera olaman?',
  en: 'I found your profile. How can I help you today?',
}

export function welcomeBack(lang: Lang): string {
  return WELCOME_BACK[lang] ?? WELCOME_BACK.en
}

/** True once a greeting has been sent and we're awaiting a number for this convo. */
export async function isOnboarding(conversationId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM app.onboarding_states WHERE conversation_id = $1`,
    [conversationId],
  )
  return !!rowCount && rowCount > 0
}

/** Begin (or restart) onboarding for a conversation. Returns the greeting. */
export async function startOnboarding(conversationId: string): Promise<string> {
  await getPool().query(
    `INSERT INTO app.onboarding_states (conversation_id, attempts, updated_at)
     VALUES ($1, 0, NOW())
     ON CONFLICT (conversation_id) DO UPDATE SET attempts = 0, updated_at = NOW()`,
    [conversationId],
  )
  return GREETING
}

async function clearOnboarding(conversationId: string): Promise<void> {
  await getPool().query(`DELETE FROM app.onboarding_states WHERE conversation_id = $1`, [
    conversationId,
  ])
}

async function bumpAttempts(conversationId: string): Promise<number> {
  const { rows } = await getPool().query<{ attempts: number }>(
    `INSERT INTO app.onboarding_states (conversation_id, attempts, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (conversation_id)
       DO UPDATE SET attempts = app.onboarding_states.attempts + 1, updated_at = NOW()
     RETURNING attempts`,
    [conversationId],
  )
  return rows[0]?.attempts ?? 1
}

export interface OnboardingResult {
  reply: string
  /** Set when the user was successfully identified and bound. */
  boundUserId?: number
  /** Set when onboarding exhausted its attempts and gave up. */
  escalated?: boolean
}

/**
 * Handle a reply during onboarding. Each failed reply (bad format OR unknown
 * number) counts toward the 3-attempt limit; the 3rd failure escalates.
 */
export async function handleOnboardingReply(
  channel: string,
  externalUserId: string,
  conversationId: string,
  text: string,
): Promise<OnboardingResult> {
  const number = normaliseMobileNumber(text)

  if (number === null) {
    return failOrEscalate(conversationId, INVALID)
  }

  const user = await getUserByMobileNumber(number)
  if (!user) {
    return failOrEscalate(conversationId, NOT_FOUND)
  }

  await bindIdentity(channel, externalUserId, user.id)
  await clearOnboarding(conversationId)
  logger.info({ event: 'turn.end', userId: user.id, scenario: 'onboarding' })
  return { reply: welcomeBack(user.language), boundUserId: user.id }
}

async function failOrEscalate(
  conversationId: string,
  retryMessage: string,
): Promise<OnboardingResult> {
  const attempts = await bumpAttempts(conversationId)
  if (attempts >= MAX_ATTEMPTS) {
    await clearOnboarding(conversationId)
    // No internal user exists yet, so we can't write an app.escalations row
    // (it requires a user_id FK). We log the escalation and hand off in text.
    logger.warn({ event: 'agent.escalate', reason: 'onboarding_failed', conversationId })
    return { reply: ESCALATED, escalated: true }
  }
  return { reply: retryMessage }
}
