import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TradingRealtimeState {
  orders: Array<Record<string, unknown>>;
  positions: Array<Record<string, unknown>>;
  trades: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  isConnected: boolean;
  lastSyncAt: string | null;
  error: string | null;
}

const emptyState: TradingRealtimeState = {
  orders: [],
  positions: [],
  trades: [],
  balances: [],
  isConnected: false,
  lastSyncAt: null,
  error: null,
};

export function useTradingRealtime() {
  const [state, setState] = useState<TradingRealtimeState>(emptyState);

  const refresh = useCallback(async () => {
    try {
      const [ordersResult, positionsResult, tradesResult, balancesResult] = await Promise.all([
        supabase.from("orders").select("*").order("placed_at", { ascending: false }).limit(25),
        supabase.from("positions").select("*").order("updated_at", { ascending: false }).limit(25),
        supabase.from("trades").select("*").order("executed_at", { ascending: false }).limit(25),
        supabase.from("balances").select("*").order("asset"),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (positionsResult.error) throw positionsResult.error;
      if (tradesResult.error) throw tradesResult.error;
      if (balancesResult.error) throw balancesResult.error;

      setState({
        orders: ordersResult.data ?? [],
        positions: positionsResult.data ?? [],
        trades: tradesResult.data ?? [],
        balances: balancesResult.data ?? [],
        isConnected: true,
        lastSyncAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Realtime sync failed";
      setState((current) => ({
        ...current,
        isConnected: false,
        error: message,
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel("trading-engine-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "positions" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "positions" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trades" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "balances" }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return state;
}
