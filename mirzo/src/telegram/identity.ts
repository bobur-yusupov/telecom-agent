import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, telegramLinks } from '../db/schema.js';

// SPEC.md §14.6 — resolved before every turn; if empty, the system prompt's
// identity-resolution block (agent/systemPrompt.ts) tells the agent to ask
// for a phone number and call lookupCustomer → linkCustomer.
export async function resolveSession(telegramUserId: string): Promise<{ customerId?: string; language?: 'uz' | 'en' }> {
  const link = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.telegramUserId, telegramUserId) });
  if (!link) return {};

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, link.customerId) });
  return { customerId: link.customerId, language: customer?.language };
}
