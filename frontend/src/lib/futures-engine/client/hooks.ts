import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FuturesRealtimeState {
  futuresOrders: Array<Record<string, unknown>>;
  futuresPositions: Array<Record<string, unknown>>;
  liquidations: Array<Record<string, unknown>>;
  fundingHistory: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  isConnected: boolean;
  lastSyncAt: string | null;
  error: string | null;
}

const emptyState: FuturesRealtimeState = {
  futuresOrders: [],
  futuresPositions: [],
  liquidations: [],
  fundingHistory: [],
  balances: [],
  isConnected: false,
  lastSyncAt: null,
  error: null,
};

export function useFuturesRealtime() {
  const [state, setState] = useState<FuturesRealtimeState>(emptyState);

  const refresh = useCallback(async () => {
    try {
      const [ordersResult, positionsResult, liquidationsResult, fundingHistoryResult, balancesResult] = await Promise.all([
        supabase.from("futures_orders").select("*").order("placed_at", { ascending: false }).limit(25),
        supabase.from("futures_positions").select("*").order("updated_at", { ascending: false }).limit(25),
        supabase.from("liquidation_events").select("*").order("triggered_at", { ascending: false }).limit(25),
        supabase.from("funding_history").select("*").order("settled_at", { ascending: false }).limit(25),
        supabase.from("balances").select("*").order("asset"),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (positionsResult.error) throw positionsResult.error;
      if (liquidationsResult.error) throw liquidationsResult.error;
      if (fundingHistoryResult.error) throw fundingHistoryResult.error;
      if (balancesResult.error) throw balancesResult.error;

      setState({
        futuresOrders: ordersResult.data ?? [],
        futuresPositions: positionsResult.data ?? [],
        liquidations: liquidationsResult.data ?? [],
        fundingHistory: fundingHistoryResult.data ?? [],
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
      .channel("futures-engine-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "futures_orders" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "futures_orders" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "futures_positions" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "futures_positions" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "liquidation_events" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "liquidation_events" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "funding_history" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "funding_history" }, () => {
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
