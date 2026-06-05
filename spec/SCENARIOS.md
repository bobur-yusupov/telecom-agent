# Scenarios & Acceptance Criteria

## Functional Scenarios

**SCEN-00 — User Onboarding (first-time user)**
1. User sends any message or `/start` command.
2. Bot checks: does `ctx.from.id` match any mock profile?
3. If YES → load profile, proceed normally.
4. If NO → bot replies with the multilingual greeting (one combined message, since user language is not yet known):
   > 🇹🇯 Хуш омадед ба NovaTel! Шумораи мобилии худро ворид кунед.
   > 🇷🇺 Добро пожаловать в NovaTel! Введите ваш мобильный номер.
   > 🇺🇿 NovaTel'ga xush kelibsiz! Mobil raqamingizni kiriting.
   > 🇬🇧 Welcome to NovaTel! Please enter your mobile number.
5. User replies with their number. Bot normalises to canonical 9-digit form:
   - Accept: `987654321`, `+992987654321`, `992987654321`, `0987654321`
   - Strip non-digits, strip leading country code `992`, strip leading `0`. If result is not exactly 9 digits → invalid attempt (counts toward 3-attempt limit). Reply in all four languages asking for a valid number.
6. Bot calls `getUserProfileByNumber(normalisedNumber)`.
7. If found → link `telegramId` to profile, set user language from profile, confirm in that language, proceed.
8. If not found → reply in all four languages: "Number not found. Please check and try again."
9. After 3 failed attempts (invalid format or not found, combined) → `escalateToHuman()`.

**SCEN-01 — Billing & payments**
User asks about balance, last invoice, or next payment date. Agent calls `getInvoice()` and returns itemised data from the user's mock profile.

**SCEN-02 — Plan change**
User browses or switches plans. Agent calls `listPlans()`, `comparePlans()`, explains the difference, and confirms the change via `changePlan()`. Change takes effect "from next month" (mocked).

**SCEN-03 — Technical support**
User reports a connectivity issue. Agent calls `checkOutage(user.region)` and `runDiagnostic(userId)` in parallel, provides troubleshooting steps. If unresolved, calls `createTicket()` and returns a ticket number.

**SCEN-04 — Cancellation & retention**
User wants to cancel. Agent follows the cancellation state machine (see [ARCHITECTURE.md](ARCHITECTURE.md#state-management)). Asks for reason → offers discount → if declined offers alternative plan → if still declined calls `escalateToHuman()`. Never skips steps.

---

## Multilingual Support

The agent MUST respond in the same language as the user's last message: Uzbek, Tajik, English, or Russian. If the user switches languages mid-conversation, the agent adapts immediately.

Tajik, Russian, and Uzbek all use Cyrillic script. English uses Latin script.

**Cross-lingual retrieval:** KB chunks are authored in Tajik + Russian, but `keywordTags` are multilingual (all four languages), so TF-IDF retrieval works regardless of the user's input language — no pre-translation step needed. Responses are generated in the user's original language from the Tajik/Russian chunk content.

**Uzbek/Tajik disambiguation:** Both use Cyrillic. The model disambiguates by vocabulary patterns. Ambiguous inputs are treated as Russian; the agent asks for clarification if needed.

## User Identification

Users are identified by `ctx.from.id` from Telegram, mapped to a mock profile in `data/users.ts`. Unknown IDs trigger SCEN-00. No login, OTP, or authentication flow required.

---

## Non-happy Paths (must be handled)

| Scenario | Edge case | Expected behaviour |
|---|---|---|
| SCEN-01 | User disputes invoice amount | Itemise via `getInvoice`, explain line items; if user still disputes → `escalateToHuman` with reason "billing dispute" |
| SCEN-02 | User asks for a plan that does not exist | Call `listPlans`, show available options, ask user to pick |
| SCEN-03 | No outage AND diagnostic 'ok', but user insists | After 1 round of troubleshooting steps → `createTicket` with category "user-reported, diagnostic clean" |
| SCEN-04 | User changes mind mid-cancellation | If user says "never mind" before `ESCALATED` → confirm, reset `cancellationState` to `INIT`, end politely |
| SCEN-00 | Number in international format `+992...` | Phone normaliser strips country code; lookup proceeds normally |
| All | Non-text message (photo, voice) | Reply "I can only read text messages right now." Do not advance any state machine. |
| All | Tool returns `{ success: false }` | Polite apology in user's language + `escalateToHuman(userId, error)` |
| All | Anthropic API times out (10 s) | Reply "I'm having trouble right now, please try again in a moment." Keep session active. Do not escalate. |

---

## Demo Script

A single linear walkthrough exercising every scenario × language. Use as integration test until automated tests exist.

1. **SCEN-00 (English).** New Telegram account (persona #8). Send `/start` → expect multilingual greeting. Reply with `+992111222333` → expect "not found." Reply with persona #2's number → expect Tajik greeting. Confirm profile linking.
2. **SCEN-01 (Russian).** As persona #5 (frustrated, overdue). Ask "сколько я должен?" → expect `getInvoice` call, itemised breakdown, mention of overdue status.
3. **SCEN-02 (English).** As persona #3 (businessman). Ask "what plans do you have?" → expect `listPlans`. Ask "compare Connect and Unlimited Pro" → expect `comparePlans`, agent explains differences and asks for confirmation.
4. **SCEN-02 confirmation.** Reply "yes, switch me" → expect `changePlan`, confirmation with effective date "first of next month".
5. **SCEN-03 (Tajik).** As persona #4 (rural). Ask "Интернет кор намекунад" → expect `checkOutage("Kulob")` + `runDiagnostic` in parallel. If outage active → ETA reply. If clean → troubleshooting; if user still complains → `createTicket`.
6. **SCEN-04 (Russian).** As persona #5. Say "хочу отключить услугу" → verify INIT → REASON_ASKED → OFFER_PRESENTED. Reply "нет" → ALTERNATIVE_PRESENTED. Reply "нет" → `escalateToHuman`.
7. **Memory check.** Same process, new conversation as persona #5. Ask any question → expect memory block referencing the prior session summary.
8. **Language switch.** Send a message in Russian, follow up in English → response language switches immediately.
9. **Preferences update.** Say "please keep replies short" → expect `updateUserPreferences({ responseLength: 'short' })`, subsequent replies measurably shorter.

---

## Acceptance Criteria

| ID | Criterion | Scenario | How to verify |
|---|---|---|---|
| SC-01 | All 4 scenarios complete without errors | SCEN-01..04 | Manual run of each scenario in Telegram |
| SC-02 | Response language matches user's language | All | Send messages in Tajik, Russian, Uzbek, English — verify response language |
| SC-03 | Agent never invents data | All | All figures must match mock profile values exactly |
| SC-04 | No conversation reaches a dead end | All | Every path ends with resolution or escalateToHuman() |
| SC-05 | p95 response latency under 5 seconds | All | Measure from `ctx.message` arrival to first `ctx.reply` resolution (excluding typing-indicator delay). Log every turn's `durationMs`. |
| SC-06 | Long-term memory persists across sessions within a single process run | SCEN-01..04 | End conversation, start new one in same process, verify agent recalls prior context |
| SC-07 | KB retrieval returns relevant chunks | All | Test 10 sample questions, verify top-3 chunks are on-topic |
| SC-08 | User preferences affect agent behaviour | All | Set `responseLength: 'short'`, verify brevity of responses |
| SC-09 | Onboarding flow works for unknown users | SCEN-00 | Use a Telegram ID not in mock data, verify number prompt and profile linking |
| SC-10 | Cancellation state machine runs in correct order | SCEN-04 | Trigger cancellation, verify INIT→REASON→OFFER→ESCALATED sequence |
| SC-11 | Error handling — no raw errors shown to user | All | Simulate tool failure, verify polite fallback + escalation |
