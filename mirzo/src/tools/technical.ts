import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logAudit } from '../db/audit.js';
import { db } from '../db/client.js';
import { outages } from '../db/schema.js';
import { traceId } from './context.js';

export const checkNetworkStatus = createTool({
  id: 'checkNetworkStatus',
  description: 'Check whether there is a known network outage in a region, and its ETA.',
  inputSchema: z.object({ region: z.string() }),
  execute: async ({ region }, ctx) => {
    const outage = await db.query.outages.findFirst({ where: eq(outages.region, region) });
    const result = outage
      ? { outage: outage.active, eta: outage.eta }
      : { outage: false as const, eta: null };

    await logAudit({ traceId: traceId(ctx), toolName: 'checkNetworkStatus', outcome: 'read', args: { region }, result });
    return result;
  },
});
