-- Trading engine schema, tables, policies, and atomic balance helpers.

DO $$
BEGIN
  CREATE TYPE public.order_side AS ENUM ('buy', 'sell');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.order_type AS ENUM ('market', 'limit', 'stop', 'take_profit', 'stop_loss');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.order_status AS ENUM ('new', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS buy_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sell_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS market_order_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limit_order_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stop_order_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tp_sl_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_position_size NUMERIC(36,18),
  ADD COLUMN IF NOT EXISTS max_order_size NUMERIC(36,18),
  ADD COLUMN IF NOT EXISTS slippage_max_bps INT NOT NULL DEFAULT 300;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL REFERENCES public.markets(symbol),
  side public.order_side NOT NULL,
  type public.order_type NOT NULL,
  status public.order_status NOT NULL DEFAULT 'new',
  quantity NUMERIC(36,18) NOT NULL CHECK (quantity > 0),
  remaining_quantity NUMERIC(36,18) NOT NULL CHECK (remaining_quantity >= 0),
  price NUMERIC(36,18),
  stop_price NUMERIC(36,18),
  time_in_force TEXT NOT NULL DEFAULT 'GTC',
  leverage NUMERIC(36,18) NOT NULL DEFAULT 1,
  avg_fill_price NUMERIC(36,18) DEFAULT 0,
  total_filled_quantity NUMERIC(36,18) NOT NULL DEFAULT 0,
  fee_paid NUMERIC(36,18) NOT NULL DEFAULT 0,
  locked_notional NUMERIC(36,18) NOT NULL DEFAULT 0,
  reduce_only BOOLEAN NOT NULL DEFAULT false,
  rejected_reason TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user_status ON public.orders(user_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_symbol_status ON public.orders(symbol, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market ON public.orders(market_id);

CREATE TABLE IF NOT EXISTS public.executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  counter_order_id UUID REFERENCES public.orders(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  side public.order_side NOT NULL,
  quantity NUMERIC(36,18) NOT NULL CHECK (quantity > 0),
  price NUMERIC(36,18) NOT NULL CHECK (price > 0),
  maker_taker TEXT NOT NULL DEFAULT 'taker',
  fee NUMERIC(36,18) NOT NULL DEFAULT 0,
  fee_asset TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_executions_user ON public.executions(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_order ON public.executions(order_id);

CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.executions(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  counter_order_id UUID REFERENCES public.orders(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  side public.order_side NOT NULL,
  quantity NUMERIC(36,18) NOT NULL CHECK (quantity > 0),
  price NUMERIC(36,18) NOT NULL CHECK (price > 0),
  fee NUMERIC(36,18) NOT NULL DEFAULT 0,
  fee_asset TEXT NOT NULL,
  maker_taker TEXT NOT NULL DEFAULT 'taker',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON public.trades(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON public.trades(symbol, executed_at DESC);

CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'long',
  quantity NUMERIC(36,18) NOT NULL DEFAULT 0,
  average_entry_price NUMERIC(36,18) NOT NULL DEFAULT 0,
  current_price NUMERIC(36,18) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON public.positions(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.pnl_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  symbol TEXT NOT NULL,
  realized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(36,18) NOT NULL DEFAULT 0,
  snapshot_price NUMERIC(36,18) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'snapshot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pnl_history_user ON public.pnl_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_actor ON public.admin_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs(action, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnl_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users manage own orders" ON public.orders
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own executions" ON public.executions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own trades" ON public.trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own positions" ON public.positions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own pnl history" ON public.pnl_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users view own order events" ON public.order_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Admins view admin logs" ON public.admin_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executions TO authenticated;
GRANT SELECT ON public.trades TO authenticated;
GRANT SELECT ON public.positions TO authenticated;
GRANT SELECT ON public.pnl_history TO authenticated;
GRANT SELECT ON public.order_events TO authenticated;
GRANT SELECT ON public.admin_logs TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.executions TO service_role;
GRANT ALL ON public.trades TO service_role;
GRANT ALL ON public.positions TO service_role;
GRANT ALL ON public.pnl_history TO service_role;
GRANT ALL ON public.order_events TO service_role;
GRANT ALL ON public.admin_logs TO service_role;

CREATE OR REPLACE FUNCTION public.lock_balance_for_order(p_user_id UUID, p_asset TEXT, p_amount NUMERIC)
RETURNS TABLE(available NUMERIC, locked NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_available NUMERIC;
  current_locked NUMERIC;
BEGIN
  INSERT INTO public.balances (user_id, asset, available, locked)
  VALUES (p_user_id, p_asset, 0, 0)
  ON CONFLICT (user_id, asset) DO NOTHING;

  SELECT available, locked INTO current_available, current_locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset
  FOR UPDATE;

  IF current_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance for order reservation';
  END IF;

  UPDATE public.balances
  SET available = available - p_amount,
      locked = locked + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id AND asset = p_asset;

  RETURN QUERY
  SELECT available, locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_locked_balance(p_user_id UUID, p_asset TEXT, p_amount NUMERIC)
RETURNS TABLE(available NUMERIC, locked NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_locked NUMERIC;
BEGIN
  SELECT locked INTO current_locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset
  FOR UPDATE;

  IF current_locked < p_amount THEN
    RAISE EXCEPTION 'Locked balance insufficient';
  END IF;

  UPDATE public.balances
  SET available = available + p_amount,
      locked = locked - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id AND asset = p_asset;

  RETURN QUERY
  SELECT available, locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_balance_atomic(p_user_id UUID, p_asset TEXT, p_available_delta NUMERIC, p_locked_delta NUMERIC)
RETURNS TABLE(available NUMERIC, locked NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_available NUMERIC;
  current_locked NUMERIC;
BEGIN
  INSERT INTO public.balances (user_id, asset, available, locked)
  VALUES (p_user_id, p_asset, 0, 0)
  ON CONFLICT (user_id, asset) DO NOTHING;

  SELECT available, locked INTO current_available, current_locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset
  FOR UPDATE;

  IF current_available + p_available_delta < 0 THEN
    RAISE EXCEPTION 'Available balance would go negative';
  END IF;

  IF current_locked + p_locked_delta < 0 THEN
    RAISE EXCEPTION 'Locked balance would go negative';
  END IF;

  UPDATE public.balances
  SET available = available + p_available_delta,
      locked = locked + p_locked_delta,
      updated_at = now()
  WHERE user_id = p_user_id AND asset = p_asset;

  RETURN QUERY
  SELECT available, locked
  FROM public.balances
  WHERE user_id = p_user_id AND asset = p_asset;
END;
$$;
