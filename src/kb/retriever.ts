import { embed, embedMany } from 'ai'
import { google } from '@ai-sdk/google'
import { PgVector } from '@mastra/pg'
import { getPgConfig } from '../db/client.js'
import { logger } from '../utils/logger.js'

const INDEX_NAME = 'kb_chunks'
// text-embedding-004 emits 768-dim vectors.
const EMBEDDING_DIMENSION = 768

const embeddingModel = google.textEmbeddingModel(
  process.env.EMBEDDING_MODEL ?? 'text-embedding-004',
)

let vectorStore: PgVector | undefined

function getVectorStore(): PgVector {
  if (!vectorStore) {
    vectorStore = new PgVector({
      id: 'mirzo-kb',
      schemaName: 'vectors',
      ...getPgConfig(),
    })
  }
  return vectorStore
}

function chunkText(chunk: { question: string; answer: string; keywordTags: string[] }): string {
  return [chunk.question, chunk.answer, chunk.keywordTags.join(' ')].join('\n')
}

/**
 * Idempotent: creates the pgvector index if missing, then embeds and upserts
 * every chunk. Uses chunkId as the vector id so re-runs replace existing rows.
 */
export async function buildRetriever(): Promise<void> {
  const { chunks } = await import('./chunks.js')
  const store = getVectorStore()

  await store.createIndex({
    indexName: INDEX_NAME,
    dimension: EMBEDDING_DIMENSION,
    metric: 'cosine',
  })

  const values = chunks.map(chunkText)
  const { embeddings } = await embedMany({ model: embeddingModel, values })

  await store.upsert({
    indexName: INDEX_NAME,
    vectors: embeddings,
    ids: chunks.map((c) => c.chunkId),
    metadata: chunks.map((c) => ({
      chunkId: c.chunkId,
      group: c.group,
      question: c.question,
      answer: c.answer,
    })),
  })

  logger.info({ event: 'kb.retrieve', message: 'indexed', count: chunks.length })
}

export interface SearchResult {
  chunkId: string
  group: string
  score: number
  question: string
  answer: string
}

export async function searchKB(query: string, topK = 3): Promise<SearchResult[]> {
  const store = getVectorStore()
  const { embedding } = await embed({ model: embeddingModel, value: query })

  const hits = await store.query({
    indexName: INDEX_NAME,
    queryVector: embedding,
    topK,
    minScore: 0.5,
  })

  return hits.map((h) => ({
    chunkId: (h.metadata?.chunkId as string) ?? h.id,
    group: (h.metadata?.group as string) ?? 'unknown',
    score: h.score,
    question: (h.metadata?.question as string) ?? '',
    answer: (h.metadata?.answer as string) ?? '',
  }))
}
