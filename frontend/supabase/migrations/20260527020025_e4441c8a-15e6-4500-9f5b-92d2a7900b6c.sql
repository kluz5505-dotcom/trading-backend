
-- Add moderator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

-- Login history
CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  ip_address inet,
  user_agent text,
  event text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own login history" ON public.login_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own login history" ON public.login_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all login history" ON public.login_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id, created_at DESC);

-- Platform settings (singleton)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id int PRIMARY KEY DEFAULT 1,
  trading_enabled boolean NOT NULL DEFAULT true,
  deposits_enabled boolean NOT NULL DEFAULT true,
  withdrawals_enabled boolean NOT NULL DEFAULT true,
  registration_enabled boolean NOT NULL DEFAULT true,
  emergency_shutdown boolean NOT NULL DEFAULT false,
  maintenance_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT singleton CHECK (id = 1)
);
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads platform settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
