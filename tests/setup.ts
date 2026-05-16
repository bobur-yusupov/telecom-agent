import 'dotenv/config'
import { initDb } from '../src/db/init.js'
import { buildRetriever } from '../src/kb/retriever.js'

await initDb()
await buildRetriever()
