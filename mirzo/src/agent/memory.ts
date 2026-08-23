import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

// MASTRA.md §5 — schemaName keeps Mastra's own thread/message/score tables
// out of the public schema Drizzle owns (SPEC.md §4).
export const store = new PostgresStore({
  id: 'mirzo-memory',
  connectionString: process.env.DATABASE_URL,
  schemaName: 'mastra',
});

export const memory = new Memory({
  storage: store,
  options: { lastMessages: 20 }, // no vector/semanticRecall — SPEC doesn't call for it
});
