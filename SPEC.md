# Telecom Support AI Agent — Spec Index

A Telegram-based customer support agent for **NovaTel** (fictitious Tajikistan telecom). Handles billing, plan changes, technical support, and cancellation/retention in Uzbek, Tajik, English, and Russian.

## Sub-specs

| File | Contents |
|---|---|
| [spec/SCENARIOS.md](spec/SCENARIOS.md) | SCEN-00..04, multilingual rules, non-happy paths, demo script, acceptance criteria |
| [spec/ARCHITECTURE.md](spec/ARCHITECTURE.md) | Agent design, all tool signatures, RAG/KB pipeline, cancellation FSM, memory, context window, error handling |
| [spec/IMPLEMENTATION.md](spec/IMPLEMENTATION.md) | System prompt draft, inline keyboards, Telegram UX, concurrency, logging, file/module layout |
| [spec/DATA.md](spec/DATA.md) | 8 personas, service catalog, user/preferences/interaction schemas, KB chunk inventory |
| [FAQs.md](FAQs.md) | Raw KB content — 23 chunks in Tajik + Russian across 6 topic groups |

---

## Tech Stack

| Component | Technology |
|:---|:---|
| AI Framework | Mastra (TypeScript) |
| Channel | Telegram Bot (telegraf.js) |
| Model | Groq Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) — prototype |
| RAG | TF-IDF cosine search over in-memory KB chunks with multilingual keyword tags |
| Memory | Mastra Memory — short-term (thread) + long-term (in-memory Map) |
| Data layer | In-memory JS objects — no database for prototype |
| Languages | Uzbek, Tajik, English, Russian |

## Environment Variables

```
TELEGRAM_TOKEN=...
GROQ_API_KEY=...
MODEL_NAME=meta-llama/llama-4-scout-17b-16e-instruct   # any Groq-hosted model
LOG_LEVEL=info                                # debug | info | warn | error
AGENT_MODE=studio                             # studio | telegram
```

Model initialisation in Mastra:
```typescript
import { groq } from '@ai-sdk/groq'
const model = groq(process.env.MODEL_NAME)
```

---

## Decisions

- **KB chunk language:** Tajik + Russian for question/answer text; multilingual `keywordTags` (all four languages) drive TF-IDF retrieval. English/Uzbek responses generated at inference time. Upgrade to `multilingual-e5-large` embeddings if recall is insufficient.
- **Model (prototype):** Groq Llama 4 Scout (`meta-llama/llama-4-scout-17b-16e-instruct`) — 17B-active mixture-of-experts model with explicit multilingual training, non-reasoning (no `<think>` blocks, no `reasoning_content` field). Highest TPM on Groq's free tier (30K) of any chat model the account can access. Production target is Claude Sonnet 4.5; revisit after eval. Configurable via `MODEL_NAME`.
- **Long-term memory:** In-process `Map<userId, LongTermMemory>` for the prototype. SQLite is a one-day swap if persistence across process restarts becomes a demo requirement — isolate reads/writes in `memory/longTerm.ts`.
- **Single agent:** No router agent. The model classifies intent + selects tools in one pass. Revisit multi-agent only if routing fails in testing.

## Out of Scope (prototype)

- Real database or external APIs
- Authentication, OTP, or identity verification
- Payment processing
- Web UI, voice message support, admin dashboard
- Disk-persistent long-term memory *(next iteration)*
- External embedding API for RAG *(next iteration)*
- Inactivity-based session timeout *(next iteration)*
