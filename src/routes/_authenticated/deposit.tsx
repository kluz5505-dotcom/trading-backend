import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { submitDeposit } from "@/lib/finance.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/deposit")({
  component: DepositPage,
});

function DepositPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(submitDeposit);

  const [asset, setAsset] = useState<string>("USDT");
  const [network, setNetwork] = useState<string>("TRC20");
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("deposit-page-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_addresses" }, () => {
        void qc.invalidateQueries({ queryKey: ["address", user.id, asset, network] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wallet_addresses" }, () => {
        void qc.invalidateQueries({ queryKey: ["address", user.id, asset, network] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "wallet_addresses" }, () => {
        void qc.invalidateQueries({ queryKey: ["address", user.id, asset, network] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "deposits" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-deposits", user.id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deposits" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-deposits", user.id] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "deposits" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-deposits", user.id] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, user?.id, asset, network]);

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("symbol, name, networks, deposit_enabled")
        .eq("deposit_enabled", true);
      if (error) throw error;
      return data;
    },
  });

  const address = useQuery({
    queryKey: ["address", user?.id, asset, network],
    enabled: !!user && !!asset && !!network,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_addresses")
        .select("address, memo")
        .eq("asset", asset)
        .eq("network", network as never)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      fn({
        data: {
          asset,
          network: network as never,
          amount: Number(amount),
          txid: txid || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Deposit submitted. Pending admin approval.");
      setAmount("");
      setTxid("");
      qc.invalidateQueries({ queryKey: ["my-deposits"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const selectedAsset = assets.data?.find((a) => a.symbol === asset);
  const networks: string[] = (selectedAsset?.networks as string[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Deposit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Asset</Label>
              <Select value={asset} onValueChange={(v) => {
                setAsset(v);
                const nets = assets.data?.find((a) => a.symbol === v)?.networks as string[] | undefined;
                if (nets?.length) setNetwork(nets[0]);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assets.data?.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>
                      {a.symbol} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Network</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {networks.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 bg-muted/30">
            <div className="text-xs text-muted-foreground">Deposit address</div>
            {address.isLoading ? (
              <div className="mt-2 text-sm">Loading…</div>
            ) : address.data?.address ? (
              <>
                <div className="mt-1 font-mono text-sm break-all">{address.data.address}</div>
                {address.data.memo && (
                  <div className="mt-1 text-xs">Memo: <span className="font-mono">{address.data.memo}</span></div>
                )}
              </>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                No address assigned yet. Please contact support — an admin must
                assign your {asset}/{network} address before you can deposit.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="txid">Transaction hash (TXID)</Label>
            <Input
              id="txid"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              placeholder="0x… / blockchain transaction id"
            />
          </div>

          <Button
            className="w-full"
            disabled={!address.data?.address || !amount || submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit deposit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
