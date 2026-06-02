
-- ============ EXTEND markets ============
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'crypto',
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS buy_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sell_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leverage_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS market_order_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limit_order_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stop_order_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tp_sl_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_leverage integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS maintenance_margin_bps integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS liquidation_threshold_bps integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS funding_fee_bps integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_order_size numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_order_size numeric,
  ADD COLUMN IF NOT EXISTS max_position_size numeric,
  ADD COLUMN IF NOT EXISTS max_open_positions integer,
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'binance',
  ADD COLUMN IF NOT EXISTS price_source_symbol text,
  ADD COLUMN IF NOT EXISTS backup_price_source text,
  ADD COLUMN IF NOT EXISTS price_deviation_max_bps integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS flash_crash_protection boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slippage_max_bps integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS session_schedule jsonb NOT NULL DEFAULT '{"mode":"24x7"}'::jsonb,
  ADD COLUMN IF NOT EXISTS weekend_trading boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message text,
  ADD COLUMN IF NOT EXISTS hidden_from_frontend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE INDEX IF NOT EXISTS idx_markets_category ON public.markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets(status);

-- ============ MARKET EVENTS (audit) ============
CREATE TABLE IF NOT EXISTS public.market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid,
  symbol text NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_events TO authenticated;
GRANT ALL ON public.market_events TO service_role;
ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view market events" ON public.market_events;
CREATE POLICY "Admins view market events" ON public.market_events
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_market_events_symbol ON public.market_events(symbol, created_at DESC);

-- ============ PRICE OVERRIDES ============
CREATE TABLE IF NOT EXISTS public.market_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  override_price numeric NOT NULL,
  reason text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_price_overrides TO authenticated;
GRANT ALL ON public.market_price_overrides TO service_role;
ALTER TABLE public.market_price_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads price overrides" ON public.market_price_overrides;
CREATE POLICY "Anyone reads price overrides" ON public.market_price_overrides
  FOR SELECT TO anon, authenticated USING (true);

-- ============ SEED assets FIRST (FK target) ============
INSERT INTO public.assets (symbol, name, decimals, networks, enabled, deposit_enabled, withdrawal_enabled)
VALUES
  ('USD','US Dollar',2,'{}'::network_type[],true,false,false),
  ('EUR','Euro',2,'{}'::network_type[],true,false,false),
  ('GBP','British Pound',2,'{}'::network_type[],true,false,false),
  ('JPY','Japanese Yen',2,'{}'::network_type[],true,false,false),
  ('CHF','Swiss Franc',2,'{}'::network_type[],true,false,false),
  ('AUD','Australian Dollar',2,'{}'::network_type[],true,false,false),
  ('CAD','Canadian Dollar',2,'{}'::network_type[],true,false,false),
  ('NZD','NZ Dollar',2,'{}'::network_type[],true,false,false),
  ('XAU','Gold (oz)',4,'{}'::network_type[],true,false,false),
  ('OIL','WTI Crude',4,'{}'::network_type[],true,false,false),
  ('SPX','S&P 500',2,'{}'::network_type[],true,false,false),
  ('NDX','Nasdaq 100',2,'{}'::network_type[],true,false,false),
  ('DJI','Dow Jones',2,'{}'::network_type[],true,false,false),
  ('UKX','FTSE 100',2,'{}'::network_type[],true,false,false),
  ('DAX','DAX 40',2,'{}'::network_type[],true,false,false),
  ('N225','Nikkei 225',2,'{}'::network_type[],true,false,false),
  ('BNB','BNB',8,'{BEP20}'::network_type[],true,true,true)
ON CONFLICT (symbol) DO NOTHING;

-- ============ Backfill category for existing rows ============
UPDATE public.markets SET category='crypto', price_source='binance',
  price_source_symbol=COALESCE(price_source_symbol, replace(symbol,'-PERP',''))
WHERE price_source_symbol IS NULL;

-- Crypto perps extras
INSERT INTO public.markets (symbol, base_asset, quote_asset, market_type, status, max_leverage, category, display_name, price_source, price_source_symbol, spread_bps, taker_fee_bps, maker_fee_bps)
VALUES
  ('XRPUSDT-PERP','XRP','USDT','futures','active',50,'crypto','XRP / USDT Perp','binance','XRPUSDT',5,20,10),
  ('BNBUSDT-PERP','BNB','USDT','futures','active',50,'crypto','BNB / USDT Perp','binance','BNBUSDT',5,20,10)
ON CONFLICT (symbol) DO NOTHING;

-- Forex
INSERT INTO public.markets (symbol, base_asset, quote_asset, market_type, status, max_leverage, category, display_name, price_source, price_source_symbol, spread_bps, taker_fee_bps, maker_fee_bps, session_schedule, weekend_trading)
VALUES
  ('EURUSD','EUR','USD','forex','active',500,'forex','EUR / USD','external','EURUSD',2,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('GBPUSD','GBP','USD','forex','active',500,'forex','GBP / USD','external','GBPUSD',2,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('USDJPY','USD','JPY','forex','active',500,'forex','USD / JPY','external','USDJPY',2,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('USDCHF','USD','CHF','forex','active',500,'forex','USD / CHF','external','USDCHF',3,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('AUDUSD','AUD','USD','forex','active',500,'forex','AUD / USD','external','AUDUSD',3,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('USDCAD','USD','CAD','forex','active',500,'forex','USD / CAD','external','USDCAD',3,5,3,'{"mode":"forex24x5"}'::jsonb,false),
  ('NZDUSD','NZD','USD','forex','active',500,'forex','NZD / USD','external','NZDUSD',4,5,3,'{"mode":"forex24x5"}'::jsonb,false)
ON CONFLICT (symbol) DO NOTHING;

-- Indices
INSERT INTO public.markets (symbol, base_asset, quote_asset, market_type, status, max_leverage, category, display_name, price_source, price_source_symbol, spread_bps, taker_fee_bps, maker_fee_bps, session_schedule, weekend_trading)
VALUES
  ('SPX500','SPX','USD','indices','active',100,'indices','S&P 500','external','SPX500',5,8,5,'{"mode":"us_equity"}'::jsonb,false),
  ('NAS100','NDX','USD','indices','active',100,'indices','Nasdaq 100','external','NAS100',5,8,5,'{"mode":"us_equity"}'::jsonb,false),
  ('US30','DJI','USD','indices','active',100,'indices','Dow Jones 30','external','US30',5,8,5,'{"mode":"us_equity"}'::jsonb,false),
  ('UK100','UKX','GBP','indices','active',100,'indices','FTSE 100','external','UK100',5,8,5,'{"mode":"lse"}'::jsonb,false),
  ('GER40','DAX','EUR','indices','active',100,'indices','DAX 40','external','GER40',5,8,5,'{"mode":"xetra"}'::jsonb,false),
  ('JPN225','N225','JPY','indices','active',100,'indices','Nikkei 225','external','JPN225',6,8,5,'{"mode":"tse"}'::jsonb,false)
ON CONFLICT (symbol) DO NOTHING;

-- Commodities
INSERT INTO public.markets (symbol, base_asset, quote_asset, market_type, status, max_leverage, category, display_name, price_source, price_source_symbol, spread_bps, taker_fee_bps, maker_fee_bps, session_schedule, weekend_trading)
VALUES
  ('XAUUSD','XAU','USD','commodities','active',20,'commodities','Gold / USD','external','XAUUSD',8,10,6,'{"mode":"metals24x5"}'::jsonb,false),
  ('USOIL','OIL','USD','commodities','active',20,'commodities','WTI Crude Oil','external','USOIL',10,10,6,'{"mode":"energy"}'::jsonb,false)
ON CONFLICT (symbol) DO NOTHING;

-- XRP asset (crypto-only chain set empty since no network_type for XRPL)
INSERT INTO public.assets (symbol, name, decimals, networks, enabled, deposit_enabled, withdrawal_enabled, min_withdrawal, withdrawal_fee)
VALUES ('XRP','Ripple',6,'{}'::network_type[],true,true,true,10,0.5)
ON CONFLICT (symbol) DO NOTHING;
