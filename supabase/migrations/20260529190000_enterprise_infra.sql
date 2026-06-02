CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.treasury_wallet_type AS ENUM ('hot', 'cold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.treasury_wallet_status AS ENUM ('active', 'quarantined', 'offline');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.treasury_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type public.treasury_wallet_type NOT NULL,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  address TEXT NOT NULL,
  label TEXT,
  status public.treasury_wallet_status NOT NULL DEFAULT 'active',
  balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  available_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  reserved_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  min_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  max_balance NUMERIC(36,18),
  last_synced_at TIMESTAMPTZ,
  risk_score NUMERIC(36,18) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treasury_wallets_unique ON public.treasury_wallets(wallet_type, asset, address);
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_status ON public.treasury_wallets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_asset ON public.treasury_wallets(asset, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id UUID REFERENCES public.treasury_wallets(id) ON DELETE SET NULL,
  to_wallet_id UUID REFERENCES public.treasury_wallets(id) ON DELETE SET NULL,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  amount NUMERIC(36,18) NOT NULL CHECK (amount > 0),
  transfer_type TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'failed')),
  initiated_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_transfers_status ON public.treasury_transfers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_asset ON public.treasury_transfers(asset, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reserve_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  hot_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  cold_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  total_reserve NUMERIC(36,18) NOT NULL DEFAULT 0,
  liabilities NUMERIC(36,18) NOT NULL DEFAULT 0,
  net_treasury NUMERIC(36,18) NOT NULL DEFAULT 0,
  exposure NUMERIC(36,18) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'system',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reserve_snapshots_time ON public.reserve_snapshots(snapshot_time DESC);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  device_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  country TEXT,
  risk_score NUMERIC(36,18) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON public.user_sessions(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES public.user_sessions(session_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  risk_score NUMERIC(36,18) NOT NULL DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_event_id UUID REFERENCES public.security_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'high', 'critical')),
  confidence NUMERIC(36,18) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'cleared', 'dismissed')),
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_status ON public.fraud_flags(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  subsystem TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'critical', 'failed')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  latency_ms NUMERIC(36,18) NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_service ON public.monitoring_events(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_status ON public.monitoring_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_events_status ON public.alert_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON public.alert_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  entity_type TEXT,
  entity_id TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_status ON public.risk_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_category ON public.risk_alerts(category, created_at DESC);

ALTER TABLE public.treasury_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage treasury wallets" ON public.treasury_wallets;
CREATE POLICY "Admins manage treasury wallets" ON public.treasury_wallets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage treasury transfers" ON public.treasury_transfers;
CREATE POLICY "Admins manage treasury transfers" ON public.treasury_transfers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view reserve snapshots" ON public.reserve_snapshots;
CREATE POLICY "Admins view reserve snapshots" ON public.reserve_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own sessions" ON public.user_sessions;
CREATE POLICY "Users view own sessions" ON public.user_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all sessions" ON public.user_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own security events" ON public.security_events;
CREATE POLICY "Users view own security events" ON public.security_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all security events" ON public.security_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own fraud flags" ON public.fraud_flags;
CREATE POLICY "Users view own fraud flags" ON public.fraud_flags
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all fraud flags" ON public.fraud_flags
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view monitoring events" ON public.monitoring_events;
CREATE POLICY "Admins view monitoring events" ON public.monitoring_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view alert events" ON public.alert_events;
CREATE POLICY "Admins view alert events" ON public.alert_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view risk alerts" ON public.risk_alerts;
CREATE POLICY "Admins view risk alerts" ON public.risk_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.treasury_wallets TO service_role;
GRANT ALL ON public.treasury_transfers TO service_role;
GRANT ALL ON public.reserve_snapshots TO service_role;
GRANT ALL ON public.user_sessions TO service_role;
GRANT ALL ON public.security_events TO service_role;
GRANT ALL ON public.fraud_flags TO service_role;
GRANT ALL ON public.monitoring_events TO service_role;
GRANT ALL ON public.alert_events TO service_role;
GRANT ALL ON public.risk_alerts TO service_role;
