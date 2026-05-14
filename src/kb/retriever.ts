// Builds TF-IDF vectors from chunk keywordTags at startup.
// Called once before the bot accepts messages.
import type { KBChunk } from './chunks.js'

interface ChunkVector {
  chunkId: string
  vector: Map<string, number>
}

let index: ChunkVector[] = []

function tf(term: string, tags: string[]): number {
  const count = tags.filter((t) => t === term).length
  return count / tags.length
}

function buildVector(tags: string[], idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>()
  const unique = [...new Set(tags)]
  for (const term of unique) {
    vec.set(term, tf(term, tags) * (idf.get(term) ?? 0))
  }
  return vec
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [term, valA] of a) {
    dot += valA * (b.get(term) ?? 0)
    normA += valA ** 2
  }
  for (const valB of b.values()) normB += valB ** 2
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export async function buildRetriever(): Promise<void> {
  const { chunks } = await import('./chunks.js')

  // Compute IDF across all chunks
  const df = new Map<string, number>()
  for (const chunk of chunks) {
    for (const term of new Set(chunk.keywordTags)) {
      df.set(term, (df.get(term) ?? 0) + 1)
    }
  }
  const idf = new Map<string, number>()
  for (const [term, freq] of df) {
    idf.set(term, Math.log(chunks.length / freq))
  }

  index = chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    vector: buildVector(chunk.keywordTags, idf),
  }))

  console.info(`[retriever] indexed ${index.length} chunks`)
}

export interface SearchResult {
  chunkId: string
  group: string
  score: number
  question: string
  answer: string
}

export async function searchKB(query: string, topK = 3): Promise<SearchResult[]> {
  const { chunks } = await import('./chunks.js')
  const chunkMap = new Map<string, KBChunk>(chunks.map((c) => [c.chunkId, c]))

  // Tokenise the query the same way as keywordTags (lowercase words)
  const queryTerms = query.toLowerCase().split(/\s+/)
  const queryVec = buildVector(queryTerms, new Map(index.flatMap((cv) =>
    [...cv.vector.entries()].map(([t, v]) => [t, v])
  )))

  const scored = index
    .map((cv) => ({ chunkId: cv.chunkId, score: cosineSimilarity(queryVec, cv.vector) }))
    .filter((r) => r.score >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return scored.map((r) => {
    const chunk = chunkMap.get(r.chunkId)!
    return {
      chunkId: r.chunkId,
      group: chunk.group,
      score: r.score,
      question: chunk.question,
      answer: chunk.answer,
    }
  })
}
