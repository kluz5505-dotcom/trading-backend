-- Futures trading engine schema, tables, and audit structures.

DO $$
BEGIN
  CREATE TYPE public.margin_mode AS ENUM ('isolated', 'cross');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.futures_order_type AS ENUM ('market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'stop_loss', 'trailing_stop');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.futures_order_status AS ENUM ('new', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected', 'triggered');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.futures_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  order_type public.futures_order_type NOT NULL,
  status public.futures_order_status NOT NULL DEFAULT 'new',
  quantity NUMERIC(36,18) NOT NULL CHECK (quantity > 0),
  remaining_quantity NUMERIC(36,18) NOT NULL DEFAULT 0,
  price NUMERIC(36,18),
  trigger_price NUMERIC(36,18),
  trailing_distance NUMERIC(36,18),
  leverage NUMERIC(36,18) NOT NULL DEFAULT 1,
  margin_mode public.margin_mode NOT NULL DEFAULT 'cross',
  reduce_only BOOLEAN NOT NULL DEFAULT false,
  post_only BOOLEAN NOT NULL DEFAULT false,
  avg_fill_price NUMERIC(36,18) DEFAULT 0,
  total_filled_quantity NUMERIC(36,18) NOT NULL DEFAULT 0,
  fee_paid NUMERIC(36,18) NOT NULL DEFAULT 0,
  locked_margin NUMERIC(36,18) NOT NULL DEFAULT 0,
  rejected_reason TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_futures_orders_user_status ON public.futures_orders(user_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_orders_symbol_status ON public.futures_orders(symbol, status, placed_at DESC);

CREATE TABLE IF NOT EXISTS public.futures_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  quantity NUMERIC(36,18) NOT NULL DEFAULT 0,
  average_entry_price NUMERIC(36,18) NOT NULL DEFAULT 0,
  current_price NUMERIC(36,18) NOT NULL DEFAULT 0,
  leverage NUMERIC(36,18) NOT NULL DEFAULT 1,
  margin_mode public.margin_mode NOT NULL DEFAULT 'cross',
  initial_margin NUMERIC(36,18) NOT NULL DEFAULT 0,
  maintenance_margin NUMERIC(36,18) NOT NULL DEFAULT 0,
  margin_allocated NUMERIC(36,18) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  funding_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  fee_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  liquidation_price NUMERIC(36,18),
  margin_ratio NUMERIC(36,18) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'liquidating')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_futures_positions_user_status ON public.futures_positions(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_positions_symbol ON public.futures_positions(symbol, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.liquidation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.futures_positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  mark_price NUMERIC(36,18) NOT NULL,
  liquidation_price NUMERIC(36,18) NOT NULL,
  margin_ratio NUMERIC(36,18) NOT NULL,
  quantity NUMERIC(36,18) NOT NULL,
  pnl NUMERIC(36,18) NOT NULL,
  liquidation_fee NUMERIC(36,18) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'triggered' CHECK (status IN ('triggered', 'executed', 'rejected')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_liquidation_events_user ON public.liquidation_events(user_id, triggered_at DESC);

CREATE TABLE IF NOT EXISTS public.funding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.futures_positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  funding_rate NUMERIC(36,18) NOT NULL DEFAULT 0,
  funding_fee NUMERIC(36,18) NOT NULL DEFAULT 0,
  interval_start TIMESTAMPTZ NOT NULL,
  interval_end TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_funding_history_user ON public.funding_history(user_id, settled_at DESC);

CREATE TABLE IF NOT EXISTS public.margin_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT,
  asset TEXT NOT NULL,
  amount NUMERIC(36,18) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('deposit', 'withdrawal', 'margin', 'funding', 'liquidation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_margin_transfers_user ON public.margin_transfers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_user ON public.risk_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.insurance_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT,
  amount NUMERIC(36,18) NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_insurance_fund_symbol ON public.insurance_fund(symbol, created_at DESC);

ALTER TABLE public.futures_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.futures_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margin_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_fund ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users manage own futures orders" ON public.futures_orders
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own futures positions" ON public.futures_positions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own liquidations" ON public.liquidation_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own funding history" ON public.funding_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own margin transfers" ON public.margin_transfers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own risk events" ON public.risk_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Admins view futures monitoring" ON public.futures_positions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view liquidation events" ON public.liquidation_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view funding history" ON public.funding_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view margin transfers" ON public.margin_transfers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view risk events" ON public.risk_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY IF NOT EXISTS "Admins view insurance fund" ON public.insurance_fund
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.futures_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.futures_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.liquidation_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.funding_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.margin_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.risk_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.insurance_fund TO authenticated;
GRANT ALL ON public.futures_orders TO service_role;
GRANT ALL ON public.futures_positions TO service_role;
GRANT ALL ON public.liquidation_events TO service_role;
GRANT ALL ON public.funding_history TO service_role;
GRANT ALL ON public.margin_transfers TO service_role;
GRANT ALL ON public.risk_events TO service_role;
GRANT ALL ON public.insurance_fund TO service_role;
