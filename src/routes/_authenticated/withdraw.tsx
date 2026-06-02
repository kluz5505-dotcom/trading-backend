import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { submitWithdrawal } from "@/lib/finance.functions";
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

export const Route = createFileRoute("/_authenticated/withdraw")({
  component: WithdrawPage,
});

function WithdrawPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(submitWithdrawal);

  const [asset, setAsset] = useState("USDT");
  const [network, setNetwork] = useState("TRC20");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("withdraw-page-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balance", user.id, asset] });
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balance", user.id, asset] });
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "balances" }, () => {
        void qc.invalidateQueries({ queryKey: ["balance", user.id, asset] });
        void qc.invalidateQueries({ queryKey: ["balances", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "withdrawals" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-withdrawals", user.id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "withdrawals" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-withdrawals", user.id] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "withdrawals" }, () => {
        void qc.invalidateQueries({ queryKey: ["my-withdrawals", user.id] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, user?.id, asset]);

  const assets = useQuery({
    queryKey: ["assets-w"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("symbol, name, networks, withdrawal_enabled, min_withdrawal, withdrawal_fee")
        .eq("withdrawal_enabled", true);
      if (error) throw error;
      return data;
    },
  });

  const balance = useQuery({
    queryKey: ["balance", user?.id, asset],
    enabled: !!user && !!asset,
    queryFn: async () => {
      const { data } = await supabase
        .from("balances")
        .select("available, locked")
        .eq("asset", asset)
        .maybeSingle();
      return data ?? { available: 0, locked: 0 };
    },
  });

  const selected = assets.data?.find((a) => a.symbol === asset);
  const networks: string[] = (selected?.networks as string[] | undefined) ?? [];

  const submit = useMutation({
    mutationFn: () =>
      fn({
        data: {
          asset,
          network: network as never,
          amount: Number(amount),
          to_address: to,
          memo: memo || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Withdrawal submitted. Pending admin approval.");
      setAmount("");
      setTo("");
      setMemo("");
      qc.invalidateQueries({ queryKey: ["my-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Withdraw</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Asset</Label>
              <Select
                value={asset}
                onValueChange={(v) => {
                  setAsset(v);
                  const nets = assets.data?.find((a) => a.symbol === v)?.networks as string[] | undefined;
                  if (nets?.length) setNetwork(nets[0]);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assets.data?.map((a) => (
                    <SelectItem key={a.symbol} value={a.symbol}>{a.symbol} — {a.name}</SelectItem>
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

          <div className="text-xs text-muted-foreground">
            Available: <span className="font-mono">{balance.data?.available ?? 0}</span> {asset}
            {selected && (
              <> · min {selected.min_withdrawal} · fee {selected.withdrawal_fee}</>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="to">Destination address</Label>
            <Input
              id="to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memo">Memo / tag (optional)</Label>
            <Input
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
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

          <Button
            className="w-full"
            disabled={!amount || !to || submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit withdrawal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
