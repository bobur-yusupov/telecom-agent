export const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS mastra;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS vectors;

CREATE TABLE IF NOT EXISTS app.users (
  id INTEGER PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  mobile_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  age INTEGER NOT NULL,
  language TEXT NOT NULL,
  region TEXT NOT NULL,
  plan TEXT NOT NULL,
  monthly_fee NUMERIC NOT NULL,
  data_used_gb NUMERIC NOT NULL,
  data_limit_gb NUMERIC NOT NULL,
  balance NUMERIC NOT NULL,
  next_bill_date DATE NOT NULL,
  last_invoice_amount NUMERIC NOT NULL,
  payment_status TEXT NOT NULL,
  churn_risk TEXT NOT NULL,
  open_tickets INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL,
  preferences JSONB NOT NULL,
  interaction_history JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS app.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_gb INTEGER NOT NULL,
  call_minutes_external INTEGER NOT NULL,
  call_minutes_internal INTEGER NOT NULL,
  price_somoni NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS app.addons (
  id TEXT PRIMARY KEY,
  data_gb INTEGER NOT NULL,
  price_somoni NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS app.outages (
  region TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  affected_areas TEXT[],
  estimated_resolution TIMESTAMPTZ,
  incident_id TEXT
);

CREATE SEQUENCE IF NOT EXISTS app.tickets_id_seq START 1000;
CREATE TABLE IF NOT EXISTS app.tickets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS app.escalations_id_seq START 9000;
CREATE TABLE IF NOT EXISTS app.escalations (
  reference_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.long_term_memory (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id),
  last_interaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_interactions INTEGER NOT NULL DEFAULT 0,
  offers_shown TEXT[] NOT NULL DEFAULT '{}',
  previous_plans TEXT[] NOT NULL DEFAULT '{}',
  resolved_issues TEXT[] NOT NULL DEFAULT '{}',
  satisfaction_signals TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS app.cancellation_states (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id),
  state TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.session_presented_offers (
  user_id INTEGER NOT NULL REFERENCES app.users(id),
  offer_id TEXT NOT NULL,
  PRIMARY KEY (user_id, offer_id)
);
`
