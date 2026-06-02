import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTradingRealtime } from "@/lib/trading-engine/client/hooks";
import { useFuturesRealtime } from "@/lib/futures-engine/client/hooks";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tradingRealtime = useTradingRealtime();
  const futuresRealtime = useFuturesRealtime();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("dashboard-live-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balances" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "balances" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "deposits" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["my-deposits", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "withdrawals" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["my-withdrawals", user.id] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  const balances = useQuery({
    queryKey: ["balances", user?.id],
    enabled: !!user,
    staleTime: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("balances")
        .select("asset, available, locked")
        .order("asset");
      if (error) throw error;
      return data;
    },
  });

  const txns = useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    staleTime: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, asset, type, amount, balance_after, created_at, note")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const deposits = useQuery({
    queryKey: ["my-deposits", user?.id],
    enabled: !!user,
    staleTime: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("id, asset, network, amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const withdrawals = useQuery({
    queryKey: ["my-withdrawals", user?.id],
    enabled: !!user,
    staleTime: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("id, asset, network, amount, fee, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const totalAvailable = useMemo(() =>
    (balances.data ?? []).reduce((sum, row) => sum + Number(row.available ?? 0), 0),
    [balances.data],
  );

  const totalLocked = useMemo(() =>
    (balances.data ?? []).reduce((sum, row) => sum + Number(row.locked ?? 0), 0),
    [balances.data],
  );

  const tradingStatus = tradingRealtime.isConnected ? "Connected" : "Reconnecting";
  const futuresStatus = futuresRealtime.isConnected ? "Connected" : "Reconnecting";

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Available balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalAvailable.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>
            <p className="mt-1 text-xs text-muted-foreground">Across tracked wallets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Locked balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalLocked.toLocaleString(undefined, { maximumFractionDigits: 8 })}</div>
            <p className="mt-1 text-xs text-muted-foreground">Pending withdrawal and portfolio risk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spot realtime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tradingRealtime.orders.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">{tradingStatus} · {tradingRealtime.positions.length} open positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Futures realtime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{futuresRealtime.futuresOrders.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">{futuresStatus} · {futuresRealtime.futuresPositions.length} open positions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Balances</CardTitle>
          <Badge variant={tradingRealtime.isConnected ? "default" : "secondary"}>Realtime sync {tradingRealtime.isConnected ? "online" : "backing off"}</Badge>
        </CardHeader>
        <CardContent>
          {balances.isPending ? (
            <p className="text-sm text-muted-foreground">Loading balances...</p>
          ) : balances.error ? (
            <p className="text-sm text-red-500">{balances.error.message}</p>
          ) : balances.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No balances yet. Make a deposit to fund your account.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balances.data?.map((b) => (
                <div
                  key={b.asset}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="text-xs text-muted-foreground">{b.asset}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {Number(b.available).toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })}
                  </div>
                  {Number(b.locked) > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Locked: {Number(b.locked).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent deposits</CardTitle>
          </CardHeader>
          <CardContent>
            {deposits.isPending ? (
              <p className="text-sm text-muted-foreground">Loading deposits...</p>
            ) : (
              <ItemList
                empty="No deposits yet."
                items={deposits.data?.map((d) => ({
                  id: d.id,
                  line1: `${d.amount} ${d.asset}`,
                  line2: `${d.network} · ${new Date(d.created_at).toLocaleString()}`,
                  status: d.status,
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent withdrawals</CardTitle>
          </CardHeader>
          <CardContent>
            {withdrawals.isPending ? (
              <p className="text-sm text-muted-foreground">Loading withdrawals...</p>
            ) : (
              <ItemList
                empty="No withdrawals yet."
                items={withdrawals.data?.map((w) => ({
                  id: w.id,
                  line1: `${w.amount} ${w.asset}`,
                  line2: `${w.network} · fee ${w.fee} · ${new Date(w.created_at).toLocaleString()}`,
                  status: w.status,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {txns.isPending ? (
            <p className="text-sm text-muted-foreground">Loading transactions...</p>
          ) : txns.error ? (
            <p className="text-sm text-red-500">{txns.error.message}</p>
          ) : !txns.data?.length ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {txns.data.map((t) => (
                <div key={t.id} className="flex justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {t.type} · {t.asset}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div
                      className={
                        Number(t.amount) >= 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {Number(t.amount) >= 0 ? "+" : ""}
                      {t.amount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      bal {t.balance_after}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemList({
  items,
  empty,
}: {
  items?: Array<{ id: string; line1: string; line2: string; status: string }>;
  empty: string;
}) {
  if (!items?.length)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border">
      {items.map((i) => (
        <div key={i.id} className="flex justify-between py-2 text-sm">
          <div>
            <div className="font-medium">{i.line1}</div>
            <div className="text-xs text-muted-foreground">{i.line2}</div>
          </div>
          <StatusBadge status={i.status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant as "default" | "destructive" | "secondary"}>{status}</Badge>;
}
