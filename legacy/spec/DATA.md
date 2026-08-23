# Mock Data

## Users — 8 Personas

8 profiles are defined in `src/data/users.ts`. Each persona exercises a specific axis of the system to cover every acceptance criterion without bloat.

| # | Persona | Language | Region | Plan | Churn risk | Key signals |
|---|---|---|---|---|---|---|
| 1 | Tech-savvy student | Russian | Dushanbe | Connect | low | balance OK, no open tickets |
| 2 | Elderly, low literacy | Tajik | Khujand | Starter | medium | needs short replies, casual tone |
| 3 | Businessman | English | Dushanbe | Unlimited Pro | low | high spend, formal tone |
| 4 | Rural resident | Tajik | Kulob | Starter | low | weak 3G area, prior outage |
| 5 | Frustrated customer | Russian | Dushanbe | Connect | high | overdue balance, declined offer history |
| 6 | Uzbek migrant worker | Uzbek | Bokhtar | Connect | medium | roaming history, family back home |
| 7 | Low-balance student | Tajik | Istaravshan | Starter | medium | balance below threshold, topup reminder on |
| 8 | New user (no profile) | — | — | — | — | triggers SCEN-00 onboarding |

### User profile schema

```typescript
{
  id: number,
  telegramId: number,
  name: string,
  persona: string,                          // e.g. 'student', 'businessman', 'elderly'
  age: number,
  language: 'uz' | 'tj' | 'ru' | 'en',
  region: string,                           // e.g. 'Dushanbe', 'Khujand', 'Kulob'
  plan: string,                             // plan ID
  monthlyFee: number,                       // Somoni
  dataUsedGB: number,
  dataLimitGB: number,
  balance: number,                          // Somoni
  nextBillDate: string,                     // ISO 8601
  lastInvoiceAmount: number,
  paymentStatus: 'paid' | 'overdue' | 'pending',
  churnRisk: 'low' | 'medium' | 'high',
  openTickets: number,
  deviceType: string,                       // e.g. 'Android budget', 'iPhone', 'feature phone'
  preferences: UserPreferences,
  interactionHistory: InteractionRecord[],
}
```

### UserPreferences schema

```typescript
preferences: {
  language: 'uz' | 'tj' | 'ru' | 'en',
  responseLength: 'short' | 'detailed',
  communicationStyle: 'formal' | 'casual',
  topupReminderEnabled: boolean,            // proactively warn on low balance
  lowBalanceThreshold: number,             // Somoni — triggers warning
  preferredPaymentMethod: string | null,   // e.g. 'Alifmobi', 'Esxata Mobile', 'DC Pay'
  lastKnownIssue: string | null,           // last reported technical issue type
}
```

The agent reads preferences at the start of every conversation and adjusts language, tone, and response length. If `topupReminderEnabled` is true and `balance < lowBalanceThreshold`, the agent proactively mentions the low balance. Preferences can be updated mid-conversation via `updateUserPreferences()`.

### InteractionRecord schema

```typescript
{
  date: string,                             // ISO 8601
  scenario: 'onboarding' | 'billing' | 'technical' | 'plans' | 'retention',
  resolved: boolean,
  resolutionType: 'self-served' | 'escalated' | 'abandoned',
  ticketId?: string,
  planChanged?: string,                     // new plan ID if applicable
  discountApplied?: string,                 // offer ID if applicable
}
```

---

## Service Catalog

Defined in `src/data/plans.ts`.

```
Mobile plans:
  Starter        — 10 GB, 50 min to other operators, unlimited NovaTel calls,  45 TJS/mo
  Connect        — 50 GB, 100 min to other operators, unlimited NovaTel calls,  80 TJS/mo
  Unlimited Pro  — unlimited, 100 min to other operators, unlimited NovaTel calls, 120 TJS/mo

Call packages:
  NovaTel internal         — unlimited calls,  5 TJS/mo
  Other operators 100 min  — 100 minutes,     10 TJS/mo
  Other operators 300 min  — 300 minutes,     20 TJS/mo
  International            — 3 min / 1 TJS

Data add-ons:
  Extra 1 GB   —  8 TJS
  Extra 3 GB   — 20 TJS
  Extra 10 GB  — 55 TJS
```

---

## Knowledge Base

23 chunks across 6 topic groups. Source content in `FAQs.md`; loaded at startup by `kb/chunks.ts`.

| Group | Chunk IDs | Count |
|---|---|---|
| Billing & payments | BIL-001..004 | 4 |
| Top-up & balance | TOP-001..004 | 4 |
| Plans & upgrades | PLN-001..004 | 4 |
| Technical support | TEC-001..005 | 5 |
| Roaming & international | ROA-001..003 | 3 |
| Cancellation & retention | RET-001..003 | 3 |
| **Total** | | **23** |

Each chunk has: `chunkId`, `group`, `question` (Tajik + Russian), `answer` (Tajik + Russian), `type` (`'FAQ'` or `'KB'`), `toolTags`, `keywordTags` (multilingual — all four languages, used by TF-IDF).

### Mock outages

Defined in `src/data/outages.ts`. Each entry covers a region with `status: 'active' | 'clear'`, optional `affectedAreas`, `estimatedResolution` (ISO 8601), and `incidentId`. At least one persona's region (Kulob) should have an active outage to exercise SCEN-03.
