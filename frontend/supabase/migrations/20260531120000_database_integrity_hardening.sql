-- Final database integrity hardening for trading, futures, wallet, treasury, and security surfaces.

-- Realtime replication metadata for high-churn tables.
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.executions REPLICA IDENTITY FULL;
ALTER TABLE public.trades REPLICA IDENTITY FULL;
ALTER TABLE public.positions REPLICA IDENTITY FULL;
ALTER TABLE public.pnl_history REPLICA IDENTITY FULL;
ALTER TABLE public.order_events REPLICA IDENTITY FULL;
ALTER TABLE public.admin_logs REPLICA IDENTITY FULL;
ALTER TABLE public.futures_orders REPLICA IDENTITY FULL;
ALTER TABLE public.futures_positions REPLICA IDENTITY FULL;
ALTER TABLE public.liquidation_events REPLICA IDENTITY FULL;
ALTER TABLE public.funding_history REPLICA IDENTITY FULL;
ALTER TABLE public.margin_transfers REPLICA IDENTITY FULL;
ALTER TABLE public.risk_events REPLICA IDENTITY FULL;
ALTER TABLE public.insurance_fund REPLICA IDENTITY FULL;
ALTER TABLE public.balances REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_addresses REPLICA IDENTITY FULL;
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawals REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.treasury_wallets REPLICA IDENTITY FULL;
ALTER TABLE public.treasury_transfers REPLICA IDENTITY FULL;
ALTER TABLE public.reserve_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.security_events REPLICA IDENTITY FULL;
ALTER TABLE public.fraud_flags REPLICA IDENTITY FULL;
ALTER TABLE public.monitoring_events REPLICA IDENTITY FULL;
ALTER TABLE public.alert_events REPLICA IDENTITY FULL;
ALTER TABLE public.risk_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.incidents REPLICA IDENTITY FULL;

-- Trading engine integrity constraints and hot-path indexes.
DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_remaining_quantity_check CHECK (remaining_quantity >= 0 AND remaining_quantity <= quantity);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_timestamp_order_check CHECK (updated_at >= placed_at);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_user_symbol_placed_at ON public.orders(user_id, symbol, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market_status_placed_at ON public.orders(market_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_symbol_updated_at ON public.orders(symbol, updated_at DESC);

DO $$
BEGIN
  ALTER TABLE public.executions
    ADD CONSTRAINT executions_amount_check CHECK (quantity > 0 AND price > 0 AND fee >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_executions_symbol_time ON public.executions(symbol, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_market_time ON public.executions(market_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_counter_order ON public.executions(counter_order_id, executed_at DESC);

DO $$
BEGIN
  ALTER TABLE public.trades
    ADD CONSTRAINT trades_amount_check CHECK (quantity > 0 AND price > 0 AND fee >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_trades_market_time ON public.trades(market_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_order_time ON public.trades(order_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_counter_order_time ON public.trades(counter_order_id, executed_at DESC);

DO $$
BEGIN
  ALTER TABLE public.positions
    ADD CONSTRAINT positions_quantity_check CHECK (quantity >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.positions
    ADD CONSTRAINT positions_price_check CHECK (average_entry_price >= 0 AND current_price >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_positions_market_status_updated ON public.positions(market_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_symbol_status_updated ON public.positions(symbol, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pnl_history_position_created ON public.pnl_history(position_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pnl_history_symbol_created ON public.pnl_history(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pnl_history_market_created ON public.pnl_history(market_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_events_type_created ON public.order_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON public.order_events(created_at DESC);

-- Futures engine integrity constraints and indexes.
DO $$
BEGIN
  ALTER TABLE public.futures_orders
    ADD CONSTRAINT futures_orders_remaining_quantity_check CHECK (remaining_quantity >= 0 AND remaining_quantity <= quantity);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.futures_orders
    ADD CONSTRAINT futures_orders_timestamp_order_check CHECK (updated_at >= placed_at);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_futures_orders_market_status_placed_at ON public.futures_orders(market_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_orders_symbol_status_placed_at ON public.futures_orders(symbol, status, placed_at DESC);

DO $$
BEGIN
  ALTER TABLE public.futures_positions
    ADD CONSTRAINT futures_positions_quantity_check CHECK (quantity >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.futures_positions
    ADD CONSTRAINT futures_positions_price_check CHECK (average_entry_price >= 0 AND current_price >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_futures_positions_market_status_updated ON public.futures_positions(market_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_positions_symbol_status_updated ON public.futures_positions(symbol, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_liquidation_events_position_triggered ON public.liquidation_events(position_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_liquidation_events_symbol_triggered ON public.liquidation_events(symbol, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_liquidation_events_status_triggered ON public.liquidation_events(status, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_funding_history_position_settled ON public.funding_history(position_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_funding_history_symbol_settled ON public.funding_history(symbol, settled_at DESC);

CREATE INDEX IF NOT EXISTS idx_margin_transfers_status_created ON public.margin_transfers(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_transfers_symbol_created ON public.margin_transfers(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_transfers_asset_created ON public.margin_transfers(asset, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_symbol_created ON public.risk_events(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity_created ON public.risk_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insurance_fund_source_created ON public.insurance_fund(source, created_at DESC);

-- Wallet, deposit, withdrawal, ledger performance indexes and consistency hardening.
CREATE INDEX IF NOT EXISTS idx_balances_asset_updated ON public.balances(asset, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_asset_network ON public.wallet_addresses(user_id, asset, network, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_asset_network_created ON public.wallet_addresses(asset, network, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_user_asset_created ON public.deposits(user_id, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status_asset_created ON public.deposits(status, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_asset_created ON public.withdrawals(user_id, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_asset_created ON public.withdrawals(status, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_asset_created ON public.transactions(user_id, asset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_type_created ON public.transactions(reference_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id_created ON public.transactions(reference_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_created ON public.transactions(type, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_reference_consistency CHECK (reference_id IS NULL OR reference_type IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.deposits
    ADD CONSTRAINT deposits_review_consistency CHECK ((status = 'pending' AND reviewed_at IS NULL) OR (status IN ('approved','rejected','hold') AND reviewed_at IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.withdrawals
    ADD CONSTRAINT withdrawals_review_consistency CHECK ((status = 'pending' AND reviewed_at IS NULL) OR (status IN ('approved','rejected','hold') AND reviewed_at IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.wallet_addresses
    ADD CONSTRAINT wallet_addresses_address_not_empty CHECK (length(trim(address)) > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Treasury hardening and foreign key validation.
DO $$
BEGIN
  ALTER TABLE public.treasury_wallets
    ADD CONSTRAINT treasury_wallets_balance_consistency CHECK (balance >= 0 AND available_balance >= 0 AND reserved_balance >= 0 AND available_balance + reserved_balance <= balance);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.treasury_wallets
    ADD CONSTRAINT treasury_wallets_asset_fk FOREIGN KEY (asset) REFERENCES public.assets(symbol)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_treasury_wallets_wallet_type_status_updated ON public.treasury_wallets(wallet_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_wallets_created_at ON public.treasury_wallets(created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.treasury_transfers
    ADD CONSTRAINT treasury_transfers_timestamp_check CHECK (updated_at >= created_at);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.treasury_transfers
    ADD CONSTRAINT treasury_transfers_path_check CHECK (from_wallet_id IS NULL OR from_wallet_id <> to_wallet_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.treasury_transfers
    ADD CONSTRAINT treasury_transfers_completed_at_check CHECK (completed_at IS NULL OR completed_at >= created_at);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.treasury_transfers
    ADD CONSTRAINT treasury_transfers_asset_fk FOREIGN KEY (asset) REFERENCES public.assets(symbol)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_treasury_transfers_from_wallet_created ON public.treasury_transfers(from_wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_to_wallet_created ON public.treasury_transfers(to_wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_initiated_by_created ON public.treasury_transfers(initiated_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reserve_snapshots_generated_at ON public.reserve_snapshots(generated_at DESC);

-- Security and monitoring hardening.
DO $$
BEGIN
  ALTER TABLE public.security_events
    ADD CONSTRAINT security_events_risk_score_check CHECK (risk_score >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_security_events_session_created ON public.security_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_created ON public.security_events(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_security_event_created ON public.fraud_flags(security_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_assigned_to_created ON public.fraud_flags(assigned_to, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.monitoring_events
    ADD CONSTRAINT monitoring_events_latency_check CHECK (latency_ms >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_monitoring_events_service_status_created ON public.monitoring_events(service, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_event_type_created ON public.monitoring_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_severity_created ON public.monitoring_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_source_created ON public.alert_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_entity_created ON public.alert_events(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_category_status_created ON public.risk_alerts(category, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_correlation_created ON public.risk_alerts(correlation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_severity_started_at ON public.incidents(severity, started_at DESC);

-- Operational consistency validation function.
CREATE OR REPLACE FUNCTION public.validate_database_integrity()
RETURNS TABLE(check_name TEXT, passed BOOLEAN, details TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 'balances_non_negative'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.balances WHERE available < 0 OR locked < 0),
         COALESCE((SELECT count(*)::TEXT FROM public.balances WHERE available < 0 OR locked < 0), '0');

  RETURN QUERY
  SELECT 'orders_quantity_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.orders WHERE quantity <= 0 OR remaining_quantity < 0 OR remaining_quantity > quantity),
         COALESCE((SELECT count(*)::TEXT FROM public.orders WHERE quantity <= 0 OR remaining_quantity < 0 OR remaining_quantity > quantity), '0');

  RETURN QUERY
  SELECT 'futures_orders_quantity_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.futures_orders WHERE quantity <= 0 OR remaining_quantity < 0 OR remaining_quantity > quantity),
         COALESCE((SELECT count(*)::TEXT FROM public.futures_orders WHERE quantity <= 0 OR remaining_quantity < 0 OR remaining_quantity > quantity), '0');

  RETURN QUERY
  SELECT 'treasury_wallet_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.treasury_wallets WHERE balance < 0 OR available_balance < 0 OR reserved_balance < 0 OR available_balance + reserved_balance > balance),
         COALESCE((SELECT count(*)::TEXT FROM public.treasury_wallets WHERE balance < 0 OR available_balance < 0 OR reserved_balance < 0 OR available_balance + reserved_balance > balance), '0');

  RETURN QUERY
  SELECT 'treasury_transfer_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.treasury_transfers WHERE amount <= 0 OR completed_at IS NOT NULL AND completed_at < created_at OR from_wallet_id = to_wallet_id),
         COALESCE((SELECT count(*)::TEXT FROM public.treasury_transfers WHERE amount <= 0 OR completed_at IS NOT NULL AND completed_at < created_at OR from_wallet_id = to_wallet_id), '0');

  RETURN QUERY
  SELECT 'security_event_risk_score'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.security_events WHERE risk_score < 0),
         COALESCE((SELECT count(*)::TEXT FROM public.security_events WHERE risk_score < 0), '0');

  RETURN QUERY
  SELECT 'monitoring_latency_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.monitoring_events WHERE latency_ms < 0),
         COALESCE((SELECT count(*)::TEXT FROM public.monitoring_events WHERE latency_ms < 0), '0');

  RETURN QUERY
  SELECT 'transactions_reference_consistency'::TEXT,
         NOT EXISTS (SELECT 1 FROM public.transactions WHERE reference_type IS NOT NULL AND reference_id IS NULL),
         COALESCE((SELECT count(*)::TEXT FROM public.transactions WHERE reference_type IS NOT NULL AND reference_id IS NULL), '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_database_integrity TO service_role;
