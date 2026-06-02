
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.account_status AS ENUM ('active', 'frozen', 'banned');
CREATE TYPE public.kyc_level AS ENUM ('none', 'basic', 'advanced');
CREATE TYPE public.kyc_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.deposit_status AS ENUM ('pending', 'approved', 'rejected', 'hold');
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'hold');
CREATE TYPE public.market_status AS ENUM ('active', 'paused', 'disabled');
CREATE TYPE public.network_type AS ENUM ('BTC', 'ERC20', 'TRC20', 'BEP20', 'SOL');
CREATE TYPE public.txn_type AS ENUM ('deposit', 'withdrawal', 'trade_buy', 'trade_sell', 'fee', 'adjustment', 'transfer');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  country TEXT,
  phone TEXT,
  status public.account_status NOT NULL DEFAULT 'active',
  kyc_level public.kyc_level NOT NULL DEFAULT 'none',
  withdrawals_frozen BOOLEAN NOT NULL DEFAULT false,
  trading_frozen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_status ON public.profiles(status);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ ROLES (separate table — never on profile) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ PROFILE POLICIES ============
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile basics" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  -- default role: user
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ASSETS ============
CREATE TABLE public.assets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  decimals INT NOT NULL DEFAULT 8,
  networks public.network_type[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  deposit_enabled BOOLEAN NOT NULL DEFAULT true,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT true,
  min_withdrawal NUMERIC(36, 18) NOT NULL DEFAULT 0,
  withdrawal_fee NUMERIC(36, 18) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assets TO authenticated, anon;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads assets" ON public.assets FOR SELECT TO authenticated, anon USING (enabled = true);
CREATE POLICY "Admins manage assets" ON public.assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ MARKETS ============
CREATE TABLE public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  base_asset TEXT NOT NULL REFERENCES public.assets(symbol),
  quote_asset TEXT NOT NULL REFERENCES public.assets(symbol),
  market_type TEXT NOT NULL DEFAULT 'spot',
  status public.market_status NOT NULL DEFAULT 'active',
  spread_bps INT NOT NULL DEFAULT 0,
  maker_fee_bps INT NOT NULL DEFAULT 10,
  taker_fee_bps INT NOT NULL DEFAULT 20,
  max_leverage INT NOT NULL DEFAULT 1,
  liquidity_factor NUMERIC NOT NULL DEFAULT 1,
  external_source TEXT DEFAULT 'binance',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_markets_status ON public.markets(status);
CREATE INDEX idx_markets_type ON public.markets(market_type);
GRANT SELECT ON public.markets TO authenticated, anon;
GRANT ALL ON public.markets TO service_role;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads markets" ON public.markets FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Admins manage markets" ON public.markets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ BALANCES ============
CREATE TABLE public.balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  available NUMERIC(36, 18) NOT NULL DEFAULT 0,
  locked NUMERIC(36, 18) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, asset),
  CHECK (available >= 0 AND locked >= 0)
);
CREATE INDEX idx_balances_user ON public.balances(user_id);
GRANT SELECT ON public.balances TO authenticated;
GRANT ALL ON public.balances TO service_role;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own balances" ON public.balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all balances" ON public.balances FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- writes are service_role only (server functions / admin actions)

-- ============ WALLET ADDRESSES ============
CREATE TABLE public.wallet_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  network public.network_type NOT NULL,
  address TEXT NOT NULL,
  memo TEXT,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, asset, network)
);
CREATE INDEX idx_wa_user ON public.wallet_addresses(user_id);
GRANT SELECT ON public.wallet_addresses TO authenticated;
GRANT ALL ON public.wallet_addresses TO service_role;
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own addresses" ON public.wallet_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all addresses" ON public.wallet_addresses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ DEPOSITS ============
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  network public.network_type NOT NULL,
  amount NUMERIC(36, 18) NOT NULL CHECK (amount > 0),
  address TEXT NOT NULL,
  txid TEXT,
  proof_url TEXT,
  status public.deposit_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deposits_user ON public.deposits(user_id);
CREATE INDEX idx_deposits_status ON public.deposits(status);
GRANT SELECT, INSERT ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own deposits" ON public.deposits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own deposits" ON public.deposits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND reviewed_by IS NULL);
CREATE POLICY "Admins view all deposits" ON public.deposits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- admin updates flow through server functions

-- ============ WITHDRAWALS ============
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  network public.network_type NOT NULL,
  amount NUMERIC(36, 18) NOT NULL CHECK (amount > 0),
  fee NUMERIC(36, 18) NOT NULL DEFAULT 0,
  to_address TEXT NOT NULL,
  memo TEXT,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  ip_address INET,
  user_agent TEXT,
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_w_user ON public.withdrawals(user_id);
CREATE INDEX idx_w_status ON public.withdrawals(status);
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own withdrawals" ON public.withdrawals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all withdrawals" ON public.withdrawals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- user creation + admin review flow through server functions (need to lock balance atomically)

-- ============ TRANSACTIONS (LEDGER) ============
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL REFERENCES public.assets(symbol),
  type public.txn_type NOT NULL,
  amount NUMERIC(36, 18) NOT NULL,
  balance_after NUMERIC(36, 18) NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_user_created ON public.transactions(user_id, created_at DESC);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all transactions" ON public.transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ KYC SUBMISSIONS ============
CREATE TABLE public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level public.kyc_level NOT NULL DEFAULT 'basic',
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  country TEXT,
  document_type TEXT,
  document_url TEXT,
  selfie_url TEXT,
  status public.kyc_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_user ON public.kyc_submissions(user_id);
CREATE INDEX idx_kyc_status ON public.kyc_submissions(status);
GRANT SELECT, INSERT ON public.kyc_submissions TO authenticated;
GRANT ALL ON public.kyc_submissions TO service_role;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own kyc" ON public.kyc_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users submit own kyc" ON public.kyc_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins view all kyc" ON public.kyc_submissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor_created ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON public.audit_logs(action);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ SEED ASSETS + MARKETS ============
INSERT INTO public.assets (symbol, name, decimals, networks, min_withdrawal, withdrawal_fee) VALUES
  ('USDT', 'Tether',   6, ARRAY['ERC20','TRC20','BEP20','SOL']::public.network_type[], 10,   1),
  ('BTC',  'Bitcoin',  8, ARRAY['BTC']::public.network_type[],                          0.0005, 0.0001),
  ('ETH',  'Ethereum', 8, ARRAY['ERC20']::public.network_type[],                        0.01,   0.003),
  ('SOL',  'Solana',   8, ARRAY['SOL']::public.network_type[],                          0.1,    0.01),
  ('XRP',  'Ripple',   6, ARRAY['ERC20']::public.network_type[],                        10,     0.25),
  ('BNB',  'BNB',      8, ARRAY['BEP20']::public.network_type[],                        0.01,   0.001);

INSERT INTO public.markets (symbol, base_asset, quote_asset, market_type, max_leverage) VALUES
  ('BTCUSDT', 'BTC', 'USDT', 'spot',    1),
  ('ETHUSDT', 'ETH', 'USDT', 'spot',    1),
  ('SOLUSDT', 'SOL', 'USDT', 'spot',    1),
  ('XRPUSDT', 'XRP', 'USDT', 'spot',    1),
  ('BNBUSDT', 'BNB', 'USDT', 'spot',    1),
  ('BTCUSDT-PERP', 'BTC', 'USDT', 'futures', 100),
  ('ETHUSDT-PERP', 'ETH', 'USDT', 'futures', 50),
  ('SOLUSDT-PERP', 'SOL', 'USDT', 'futures', 25);
