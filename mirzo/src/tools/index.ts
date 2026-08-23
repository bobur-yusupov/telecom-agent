import { applyCredit, compareInvoices, getBalance, getInvoice, getTransactionHistory } from './billing.js';
import { linkCustomer, lookupCustomer } from './identity.js';
import { listAddons, purchaseAddon } from './addons.js';
import { changePlan, getCurrentPlan, getUsage, listPlans } from './plans.js';
import { checkNetworkStatus } from './technical.js';
import { createTicket, requestCancellation, setRetentionAttempted } from './tickets.js';

export {
  applyCredit,
  changePlan,
  checkNetworkStatus,
  compareInvoices,
  createTicket,
  getBalance,
  getCurrentPlan,
  getInvoice,
  getTransactionHistory,
  getUsage,
  linkCustomer,
  listAddons,
  listPlans,
  lookupCustomer,
  purchaseAddon,
  requestCancellation,
  setRetentionAttempted,
};

// SPEC.md §5 — all 17 tools, ready to spread into an Agent's `tools` config.
export const tools = {
  lookupCustomer,
  linkCustomer,
  getBalance,
  getInvoice,
  getTransactionHistory,
  compareInvoices,
  applyCredit,
  getCurrentPlan,
  listPlans,
  getUsage,
  changePlan,
  listAddons,
  purchaseAddon,
  checkNetworkStatus,
  createTicket,
  setRetentionAttempted,
  requestCancellation,
};
