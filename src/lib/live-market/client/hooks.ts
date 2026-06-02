import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FeedStats, MarketSnapshot, RealtimeNotification } from "../types";

interface UseLiveMarketRealtimeProps {
  fetchSnapshot: () => Promise<MarketSnapshot[]>;
  fetchNotifications: () => Promise<RealtimeNotification[]>;
  fetchBalances: () => Promise<Array<Record<string, unknown>>>;
  fetchStatus: () => Promise<FeedStats>;
}

export function useLiveMarketRealtime({ fetchSnapshot, fetchNotifications, fetchBalances, fetchStatus }: UseLiveMarketRealtimeProps) {
  const queryClient = useQueryClient();
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [realtimeStats, setRealtimeStats] = useState<FeedStats | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      try {
        const [snapshotRows, notificationRows, balanceRows, statusRows] = await Promise.all([
          fetchSnapshot(),
          fetchNotifications(),
          fetchBalances(),
          fetchStatus(),
        ]);

        if (!isMounted) return;
        const snapshotMap = Object.fromEntries(snapshotRows.map((entry) => [entry.symbol, entry]));
        setSnapshots(snapshotMap);
        setBalances(balanceRows);
        setRealtimeStats(statusRows);
        setConnectionState("connected");
        setReconnectCount(0);
        setLastRefreshAt(new Date().toISOString());

        setNotifications((prev) => {
          const seen = new Set(prev.map((entry) => entry.id));
          const fresh = notificationRows.filter((entry) => !seen.has(entry.id));
          const merged = [...fresh, ...prev].slice(0, 25);
          fresh.forEach((entry) => {
            if (entry.severity === "critical") toast.error(entry.title, { description: entry.description });
            else if (entry.severity === "warning") toast.warning(entry.title, { description: entry.description });
            else toast.info(entry.title, { description: entry.description });
          });
          return merged;
        });
      } catch (error) {
        setConnectionState("reconnecting");
        setReconnectCount((current) => current + 1);
        console.error("Realtime sync failed", error);
      }
    };

    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [fetchSnapshot, fetchNotifications, fetchBalances, fetchStatus]);

  useEffect(() => {
    const channel = supabase
      .channel("platform-live-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "balances" }, () => {
        queryClient.invalidateQueries({ queryKey: ["platform-live-balances"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "deposits" }, () => {
        toast.success("Deposit update detected", { description: "A new deposit event is syncing in realtime." });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "withdrawals" }, () => {
        toast.info("Withdrawal update detected", { description: "A withdrawal event is syncing in realtime." });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const sortedSnapshots = useMemo(() => Object.values(snapshots).sort((a, b) => a.symbol.localeCompare(b.symbol)), [snapshots]);

  return {
    snapshots: sortedSnapshots,
    snapshotMap: snapshots,
    notifications,
    balances,
    realtimeStats,
    connectionState,
    reconnectCount,
    lastRefreshAt,
  };
}
