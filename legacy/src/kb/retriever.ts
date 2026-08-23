import { PgVector } from '@mastra/pg'
import { getPgConfig } from '../db/client.js'
import { logger } from '../utils/logger.js'

const INDEX_NAME = 'kb_chunks'
const EMBEDDING_DIMENSION = 768

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

async function getLocalEmbeddings(values: string[]): Promise<number[][]> {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
  const model = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text'
  const response = await fetch(`${host}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: values }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Ollama API error (${response.status}): ${text || response.statusText}`)
  }
  const result = (await response.json()) as { embeddings: number[][] }
  if (!result.embeddings || !Array.isArray(result.embeddings) || result.embeddings.length !== values.length) {
    throw new Error('Ollama did not return the expected number of embeddings')
  }
  return result.embeddings
}

async function getLocalEmbedding(value: string): Promise<number[]> {
  const embeddings = await getLocalEmbeddings([value])
  const embedding = embeddings[0]
  if (!embedding) throw new Error('Failed to extract embedding')
  return embedding
}

export async function buildRetriever(): Promise<void> {
  const { chunks } = await import('./chunks.js')
  const store = getVectorStore()

  await store.createIndex({
    indexName: INDEX_NAME,
    dimension: EMBEDDING_DIMENSION,
    metric: 'cosine',
  })

  const values = chunks.map(chunkText)
  try {
    const embeddings = await getLocalEmbeddings(values)

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
  } catch (error) {
    logger.warn({
      event: 'kb.retrieve',
      message: 'Failed to generate or upsert embeddings at startup. Using existing index if present.',
      error: { message: error instanceof Error ? error.message : String(error) },
    })
  }
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
  const embedding = await getLocalEmbedding(query)

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
