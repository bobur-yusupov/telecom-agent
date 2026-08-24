import 'dotenv/config';
import { startAdminServer } from './admin/server.js';

// The Telegram channel is owned by the Mastra server (`mastra dev` / a
// deployed Mastra server), activated by the `channels` config on the mirzo
// agent (agent/mirzo.ts) — not by this process. This entrypoint only owns
// the admin panel (SPEC.md §11), which is project code, not a Mastra feature.
startAdminServer();
console.log('[mirzo] admin panel live');
