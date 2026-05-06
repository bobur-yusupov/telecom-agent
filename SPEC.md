# Telecom Support AI Agent

A conversational agent that handles real customer requests in Uzbek, Tajik, English and Russian — via Telegram — covering billing, plan changes, technical issues, and cancellations.

## Tech Stack

| Component | Technology |
|:---|:---|
| AI Framework | Mastra (TypeScript) |
| Channel | Telegram Bot (telegraf.js) |
| Runtime | Node.js |
| Data layer | In-memory JS objects (no database) |
| Model | Claude claude-sonnet-4-20250514 via Mastra |
| RAG | Simple keyword/cosine search over KB chunks (in-memory) |
| Memory | Mastra Memory — short-term (thread) + long-term (persistent store) |
| Interface languages | Tajik, Russian, Uzbek |
