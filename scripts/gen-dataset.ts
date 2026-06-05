/**
 * Generate an eval dataset by running curated conversations through the live
 * Mirzo agent and capturing input/output pairs (plus the tool-result context the
 * grounding scorers need).
 *
 * Output: eval-data/dataset.json — an array of records:
 *   {
 *     id, scenario, language,
 *     input,        // the user message that elicited the final reply
 *     output,       // Mirzo's final reply (the thing scorers grade)
 *     context,      // tool-result payloads, as JSON strings (faithfulness ground truth)
 *     toolCalls,    // tool names called across the conversation, in order
 *     conversation, // full multi-turn transcript for reference
 *   }
 *
 * Run via: ./scripts/gen-dataset.sh   (boots an ephemeral DB, then this script)
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb } from '../src/db/init.js'
import { buildRetriever } from '../src/kb/retriever.js'
import { closePool } from '../src/db/client.js'
import { runConversation } from '../tests/helpers/runConversation.js'

type Lang = 'tj' | 'ru' | 'uz' | 'en'
type Scenario = 'billing' | 'plans' | 'technical' | 'retention' | 'policy'

interface Spec {
  id: string
  scenario: Scenario
  language: Lang
  userId?: number
  messages: string[]
}

// Curated, multilingual coverage. Each spec's LAST message is the `input`; the
// agent's final reply is the `output`. Keep these representative, not exhaustive.
const SPECS: Spec[] = [
  {
    id: 'billing-balance-tj',
    scenario: 'billing',
    language: 'tj',
    userId: 4,
    messages: ['Салом, рақамам 904444444', 'Ман балансама донистанам даркор'],
  },
  {
    id: 'billing-invoice-ru',
    scenario: 'billing',
    language: 'ru',
    userId: 5,
    messages: ['мой номер 905555555', 'расскажи про мой последний счёт'],
  },
  {
    id: 'plans-list-en',
    scenario: 'plans',
    language: 'en',
    userId: 3,
    messages: ['My number is 903333333', 'what plans do you offer?'],
  },
  {
    id: 'plans-compare-en',
    scenario: 'plans',
    language: 'en',
    userId: 3,
    messages: ['My number is 903333333', 'compare Connect and Unlimited Pro for me'],
  },
  {
    id: 'technical-no-internet-uz',
    scenario: 'technical',
    language: 'uz',
    userId: 6,
    messages: ['Salom, raqamim 906666666', 'internet ishlamayapti'],
  },
  {
    id: 'policy-how-to-pay-ru',
    scenario: 'policy',
    language: 'ru',
    userId: 1,
    messages: ['мой номер 901111111', 'как можно пополнить баланс?'],
  },
  {
    id: 'retention-reason-ru',
    scenario: 'retention',
    language: 'ru',
    userId: 5,
    messages: ['мой номер 905555555', 'хочу отключить услугу', 'дорого'],
  },
]

interface DatasetRecord {
  id: string
  scenario: Scenario
  language: Lang
  input: string
  output: string
  context: string[]
  toolCalls: string[]
  conversation: { user: string; assistant: string; toolCalls: string[] }[]
}

/**
 * Mastra DatasetItem shape for Studio agent experiments. `input` is a bare
 * messages ARRAY (Studio feeds it straight to MessageList.add, which iterates) —
 * the conversation up to and including the final user turn. The agent generates
 * the next reply, which is compared against `groundTruth`.
 */
interface StudioDatasetItem {
  input: { role: 'user' | 'assistant'; content: string }[]
  groundTruth: string
  metadata: { id: string; scenario: Scenario; language: Lang; toolCalls: string[] }
}

function toStudioItem(r: DatasetRecord): StudioDatasetItem {
  const input: { role: 'user' | 'assistant'; content: string }[] = []
  r.conversation.forEach((turn, i) => {
    input.push({ role: 'user', content: turn.user })
    // Include prior assistant turns as history, but not the final one — that is
    // what the agent must regenerate, and it becomes the groundTruth.
    if (i < r.conversation.length - 1) {
      input.push({ role: 'assistant', content: turn.assistant })
    }
  })
  return {
    input,
    groundTruth: r.output,
    metadata: { id: r.id, scenario: r.scenario, language: r.language, toolCalls: r.toolCalls },
  }
}

async function main(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(__dirname, '../eval-data/dataset.json')

  console.log('[gen-dataset] bootstrapping DB + KB index...')
  await initDb()
  await buildRetriever()

  const records: DatasetRecord[] = []
  for (const spec of SPECS) {
    console.log(`[gen-dataset] running ${spec.id} (${spec.messages.length} turns)...`)
    const { turns, allToolNames, finalReply } = await runConversation(spec.messages, {
      ...(spec.userId !== undefined ? { userId: spec.userId } : {}),
    })

    const context = turns
      .flatMap((t) => t.toolResults)
      .map((tr) => JSON.stringify(tr.result))

    records.push({
      id: spec.id,
      scenario: spec.scenario,
      language: spec.language,
      input: spec.messages[spec.messages.length - 1]!,
      output: finalReply,
      context,
      toolCalls: allToolNames,
      conversation: turns.map((t) => ({
        user: t.user,
        assistant: t.assistant,
        toolCalls: t.toolCalls.map((tc) => tc.toolName),
      })),
    })
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf8')
  console.log(`[gen-dataset] wrote ${records.length} records → ${outPath}`)

  // Studio-importable variant: message-shaped input + groundTruth for agent experiments.
  const studioPath = resolve(__dirname, '../eval-data/dataset.studio.json')
  const studioItems = records.map(toStudioItem)
  writeFileSync(studioPath, JSON.stringify(studioItems, null, 2) + '\n', 'utf8')
  console.log(`[gen-dataset] wrote ${studioItems.length} Studio items → ${studioPath}`)

  await closePool()
}

main().catch((err) => {
  console.error('[gen-dataset] failed:', err)
  process.exitCode = 1
})
