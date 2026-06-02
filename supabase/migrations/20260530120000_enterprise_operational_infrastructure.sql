-- Enterprise treasury, security, and monitoring infrastructure.

CREATE TABLE IF NOT EXISTS public.treasury_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('hot', 'cold')),
  asset TEXT NOT NULL,
  address TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'offline')),
  balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  available_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  reserved_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  min_balance NUMERIC(36,18) NOT NULL DEFAULT 0,
  max_balance NUMERIC(36,18),
  last_synced_at TIMESTAMPTZ,
  risk_score NUMERIC(36,18) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_type, asset, address)
);

CREATE INDEX IF NOT EXISTS idx_treasury_wallets_status ON public.treasury_wallets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_asset ON public.treasury_wallets(asset, status);

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

CREATE INDEX IF NOT EXISTS idx_reserve_snapshots_snapshot_time ON public.reserve_snapshots(snapshot_time DESC);

CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id UUID REFERENCES public.treasury_wallets(id) ON DELETE SET NULL,
  to_wallet_id UUID REFERENCES public.treasury_wallets(id) ON DELETE SET NULL,
  asset TEXT NOT NULL,
  amount NUMERIC(36,18) NOT NULL,
  transfer_type TEXT NOT NULL DEFAULT 'internal',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_transfers_status ON public.treasury_transfers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_asset ON public.treasury_transfers(asset, created_at DESC);

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','high','critical')),
  risk_score NUMERIC(36,18) NOT NULL DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON public.security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON public.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON public.security_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_event_id UUID REFERENCES public.security_events(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','high','critical')),
  confidence NUMERIC(36,18) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','cleared','dismissed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user_status ON public.fraud_flags(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_type ON public.fraud_flags(flag_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'ok',
  message TEXT NOT NULL,
  metric_name TEXT,
  metric_value NUMERIC(36,18),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_service_created ON public.monitoring_events(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_metric_name_created ON public.monitoring_events(metric_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_severity_created ON public.monitoring_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  threshold NUMERIC(36,18) NOT NULL,
  comparison TEXT NOT NULL DEFAULT '>' CHECK (comparison IN ('>','<')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_service ON public.alert_rules(service, enabled);

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  service TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','closed')),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_service_status ON public.incidents(service, status, started_at DESC);

ALTER TABLE public.treasury_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own security events" ON public.security_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users can view own fraud flags" ON public.fraud_flags
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Admins view treasury wallets" ON public.treasury_wallets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view reserve snapshots" ON public.reserve_snapshots
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view treasury transfers" ON public.treasury_transfers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view security events" ON public.security_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view fraud flags" ON public.fraud_flags
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view monitoring events" ON public.monitoring_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins manage alert rules" ON public.alert_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins manage incidents" ON public.incidents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_wallets TO authenticated;
GRANT SELECT ON public.reserve_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_transfers TO authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT ON public.fraud_flags TO authenticated;
GRANT SELECT ON public.monitoring_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;

GRANT ALL ON public.treasury_wallets TO service_role;
GRANT ALL ON public.reserve_snapshots TO service_role;
GRANT ALL ON public.treasury_transfers TO service_role;
GRANT ALL ON public.security_events TO service_role;
GRANT ALL ON public.fraud_flags TO service_role;
GRANT ALL ON public.monitoring_events TO service_role;
GRANT ALL ON public.alert_rules TO service_role;
GRANT ALL ON public.incidents TO service_role;
