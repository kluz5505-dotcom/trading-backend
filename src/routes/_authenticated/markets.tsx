import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLiveMarketRealtime } from "@/lib/live-market/client/hooks";
import {
  getPlatformLiveSnapshot,
  getPlatformRealtimeNotifications,
  getPlatformRealtimeStatus,
  getUserRealtimeBalances,
} from "@/lib/live-market/functions";

export const Route = createFileRoute("/_authenticated/markets")({
  component: MarketsPage,
});

function MarketsPage() {
  const markets = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("markets")
        .select("id, symbol, base_asset, quote_asset, market_type, status, max_leverage")
        .order("symbol");
      if (error) throw error;
      return data;
    },
  });

  const fetchSnapshot = useServerFn(getPlatformLiveSnapshot);
  const fetchNotifications = useServerFn(getPlatformRealtimeNotifications);
  const fetchStatus = useServerFn(getPlatformRealtimeStatus);
  const fetchBalances = useServerFn(getUserRealtimeBalances);

  const loadSnapshot = useCallback(async () => fetchSnapshot({}), [fetchSnapshot]);
  const loadNotifications = useCallback(async () => fetchNotifications({}), [fetchNotifications]);
  const loadStatus = useCallback(async () => fetchStatus({}), [fetchStatus]);
  const loadBalances = useCallback(async () => fetchBalances({}), [fetchBalances]);

  const { snapshots, notifications, balances, realtimeStats, connectionState, reconnectCount, lastRefreshAt } = useLiveMarketRealtime({
    fetchSnapshot: loadSnapshot,
    fetchNotifications: loadNotifications,
    fetchBalances: loadBalances,
    fetchStatus: loadStatus,
  });

  const spot = markets.data?.filter((m) => m.market_type === "spot") ?? [];
  const futures = markets.data?.filter((m) => m.market_type === "futures") ?? [];

  const liveRows = snapshots ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active symbols</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveRows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Realtime feed health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{connectionState === "connected" ? "Online" : "Reconnecting"}</div>
            <p className="mt-1 text-xs text-muted-foreground">{reconnectCount} reconnects · last refresh {lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString() : "n/a"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tracked balances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balances.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Realtime market fabric</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 rounded-md border p-3 text-sm">
            <div>
              <p className="text-muted-foreground">Connected sources</p>
              <p className="text-lg font-semibold">{realtimeStats?.connected_sources ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Heartbeat</p>
              <p className="text-lg font-semibold">{realtimeStats?.heartbeat_seconds ?? 0}s</p>
            </div>
          </div>
          <MarketTable rows={spot} snapshots={liveRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Futures / perp view</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <MarketTable rows={futures} snapshots={liveRows} showLev />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Realtime notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              notifications.slice(0, 6).map((entry) => (
                <div key={entry.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{entry.title}</p>
                    <Badge variant={entry.severity === "critical" ? "destructive" : entry.severity === "warning" ? "secondary" : "outline"}>
                      {entry.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{entry.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Realtime balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {balances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No balance updates yet.</p>
            ) : (
              balances.slice(0, 6).map((entry, index) => (
                <div key={`${String(entry.asset ?? "asset")}-${index}`} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{String(entry.asset ?? "Asset")}</p>
                    <p className="text-muted-foreground">{String(entry.wallet ?? "Wallet")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{String(entry.available ?? entry.amount ?? "—")}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MarketTable({
  rows,
  snapshots,
  showLev,
}: {
  rows: Array<{
    id: string;
    symbol: string;
    base_asset: string;
    quote_asset: string;
    status: string;
    max_leverage: number;
  }>;
  snapshots: Array<{
    symbol: string;
    price: number;
    change_24h?: number;
    change_percent?: number;
    volume_24h?: number;
    volume?: number;
    status: string;
    spread_bps?: number;
  }>;
  showLev?: boolean;
}) {
  const bySymbol = new Map(snapshots.map((entry) => [entry.symbol, entry]));

  return (
    <div className="divide-y divide-border">
      <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 py-2 text-xs uppercase text-muted-foreground">
        <div>Pair</div>
        <div className="text-right">Price</div>
        <div className="text-right">24h %</div>
        <div className="text-right">Volume</div>
        <div>{showLev ? "Lev" : "Status"}</div>
      </div>
      {rows.map((m) => {
        const snapshot = bySymbol.get(m.symbol);
        const pct = snapshot ? Number(snapshot.change_24h ?? snapshot.change_percent ?? 0) : 0;
        const price = snapshot ? Number(snapshot.price) : null;
        const volume = snapshot ? Number(snapshot.volume_24h ?? snapshot.volume ?? 0) : null;

        return (
          <div key={m.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-4 py-2.5 text-sm">
            <div className="font-medium">{m.symbol}</div>
            <div className="text-right tabular-nums">{price !== null ? price.toLocaleString() : "—"}</div>
            <div className={`text-right tabular-nums ${pct >= 0 ? "text-green-600" : "text-red-600"}`}>
              {snapshot ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
            </div>
            <div className="text-right tabular-nums text-muted-foreground">
              {volume !== null ? volume.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
            </div>
            <div>
              {showLev ? (
                <Badge variant="outline">{m.max_leverage}x</Badge>
              ) : (
                <Badge variant={snapshot?.status === "active" || snapshot?.status === "live" ? "default" : "secondary"}>{snapshot?.status ?? m.status}</Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
