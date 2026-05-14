# Implementation Guide

## System Prompt (v0 draft)

```
You are Mirzo, a customer support AI agent for NovaTel — a mobile telecom operator in Tajikistan.

LANGUAGE
- Detect the user's language from their most recent message (Tajik, Russian, Uzbek, or English).
- Respond in exactly that language. Never mix two languages in one reply.
- Tajik, Russian, and Uzbek all use Cyrillic. If a Cyrillic message is ambiguous between Tajik and
  Uzbek, treat as Russian and politely ask which language the user prefers.

DATA INTEGRITY
- Never invent numbers, plan names, prices, ticket IDs, or dates. Always retrieve them via tools.
- If you do not have a tool result or KB chunk supporting a claim, ask a clarifying question or
  call escalateToHuman.

KB AND TOOLS
- Top-3 KB chunks are pre-loaded in the [KB] block. Read them before deciding whether to answer
  or call a tool.
- For account-specific questions (balance, invoice, ticket status, plan change) → call the tool.
- For policy / how-things-work questions → the KB block is usually sufficient.
- Tools that don't depend on each other should be called together.

MEMORY
- Read the [Memory] block before responding.
- Never re-offer a discount the user has already declined (check offersShown).
- Adapt tone and length to userPreferences.communicationStyle and userPreferences.responseLength.

CANCELLATION FLOW (SCEN-04)
- The current cancellationState is in the [Session] block. Follow it strictly:
  INIT                  → ask for cancellation reason
  REASON_ASKED          → call getRetentionOffers, present best offer
  OFFER_PRESENTED       → accepted → applyDiscount; declined → OFFER_DECLINED
  OFFER_DECLINED        → present alternative plan via comparePlans
  ALTERNATIVE_PRESENTED → accepted → changePlan; declined → escalateToHuman
- Never skip a step. Never loop back unless the user explicitly restarts.

BINARY DECISIONS
- For confirmations (plan change, discount, ticket creation, cancellation), end your reply with:
  [ACTION: confirm_plan_<planId>]
  [ACTION: accept_offer_<offerId> | decline_offer_<offerId>]
  [ACTION: create_ticket | skip_ticket]
- The bot renders these as inline keyboard buttons. Do not include them in the user-visible text.

ERROR HANDLING
- If a tool returns { success: false }, apologise in the user's language and call escalateToHuman
  with the error reason. Never surface raw error strings.

IDENTITY
- You are Mirzo. Never claim to be ChatGPT, Claude, GPT, or any other system.
```

---

## Inline Keyboards & Callback Re-entry

### Action markers

The agent appends action markers to the end of replies, e.g.:
```
[ACTION: confirm_plan_unlimited_pro]
[ACTION: accept_offer_RET-20PCT-3M | decline_offer_RET-20PCT-3M]
```

`bot/callbacks.ts` strips these markers from the user-visible text and renders them as inline keyboard buttons.

### Callback handling

When the user taps a button:
1. Bot receives a `callback_query` with `callback_data` (e.g. `confirm_plan_unlimited_pro`).
2. `ctx.answerCbQuery()` — dismisses the loading spinner.
3. Edit the original message to disable buttons (prevents double-taps).
4. Inject synthetic user message: `"[User selected: confirm_plan_unlimited_pro]"` (English — it's metadata, not user content).
5. Re-run the agent turn with this synthetic message.

Every turn starts with a user message, whether typed or tapped — the loop is uniform.

### When to emit action markers

Use action markers (never free-text yes/no) for:
- Plan change confirmation
- Retention discount accept/decline
- Ticket creation confirmation
- Cancellation confirmation

```typescript
// Example rendered button pair
ctx.reply('Switch to Unlimited Pro (120 TJS/mo)?', {
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Yes, switch', callback_data: 'confirm_plan_unlimited_pro' },
      { text: '❌ No, keep current', callback_data: 'cancel_plan_change' }
    ]]
  }
})
```

---

## Telegram UX

**Typing indicator** — send before any LLM call or tool call:
```typescript
await ctx.sendChatAction('typing')
// then invoke agent
```

**Message length** — Telegram caps at 4096 characters. Split responses over 3800 chars at `\n\n` paragraph boundaries:
```typescript
function splitMessage(text: string, limit = 3800): string[] {
  const paragraphs = text.split('\n\n')
  // group into chunks under limit
}
```

**Non-text messages** — reply "I can only read text messages right now." Do not advance any state machine.

---

## Concurrency

Telegraf delivers messages sequentially per chat, but the agent loop is async, so two messages arriving within the same turn can interleave.

- **Per-chat mutex:** `Map<chatId, Promise<void>>`. New messages await the previous turn's promise before starting.
- **Queue cap:** Max 3 messages queued per chat. Messages beyond that are dropped with "please wait a moment."

---

## Logging

Structured JSON to stdout. `LOG_LEVEL` env var: `debug | info | warn | error`.

```typescript
{
  ts: string,           // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,        // see required events below
  chatId: number,
  userId?: number,
  scenario?: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention',
  toolName?: string,
  durationMs?: number,
  error?: { message: string, stack?: string },
}
```

Required log events:
| Event | When |
|---|---|
| `turn.start` / `turn.end` | Every agent turn (include `durationMs` for SC-05) |
| `tool.call` / `tool.error` | Every tool invocation |
| `kb.retrieve` | Every `searchKB` call — log query, top-3 chunk IDs, scores |
| `agent.escalate` | Whenever `escalateToHuman` fires |

---

## File / Module Layout

```
src/
  bot/
    telegram.ts        # telegraf bootstrap, message handler, callback_query handler, mutex
    callbacks.ts       # action marker parser, inline keyboard renderer
  agents/
    mirzo.ts           # Mastra agent definition + system prompt
    cancellation.ts    # state machine helpers (transitions, state predicates)
  tools/
    user.ts            # getUserProfileById, getUserProfileByNumber, updateUserPreferences
    billing.ts         # getBalance, getInvoice, applyCredit, getPaymentMethods
    plans.ts           # listPlans, comparePlans, changePlan, getDataAddons, purchaseAddon
    technical.ts       # checkOutage, runDiagnostic, createTicket, getTicketStatus
    retention.ts       # getRetentionOffers, applyDiscount
    common.ts          # searchKB, escalateToHuman, ToolResult type
  kb/
    chunks.ts          # 23 KB chunks (Tajik + Russian content, multilingual keywordTags)
    retriever.ts       # TF-IDF vectorisation at startup, cosine similarity at query time
  memory/
    shortTerm.ts       # Mastra thread wrapper + cancellationState helpers
    longTerm.ts        # Map<userId, LongTermMemory>, read/write helpers
  data/
    users.ts           # 8 mock personas
    plans.ts           # plan + addon catalog
    outages.ts         # mock outage data per region
  context/
    assemble.ts        # builds system prompt + memory block + KB block + history payload
  utils/
    logger.ts          # structured JSON logger
    phone.ts           # normaliseMobileNumber (strips +992, leading 0, non-digits)
  index.ts             # entry point — boot retriever, then start bot
```
