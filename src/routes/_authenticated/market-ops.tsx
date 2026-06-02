import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listMarketsFull,
  updateMarket,
  marketEmergencyAction,
  marketCategoryAction,
  setPriceOverride,
  recentMarketEvents,
} from "@/lib/market-ops.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/market-ops")({
  component: MarketOpsPage,
});

type Market = {
  id: string;
  symbol: string;
  display_name: string | null;
  base_asset: string;
  quote_asset: string;
  category: string;
  market_type: string;
  status: string;
  maintenance_mode: boolean;
  hidden_from_frontend: boolean;
  price_frozen: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  leverage_enabled: boolean;
  market_order_enabled: boolean;
  limit_order_enabled: boolean;
  stop_order_enabled: boolean;
  tp_sl_enabled: boolean;
  trailing_stop_enabled: boolean;
  max_leverage: number;
  min_leverage: number;
  maintenance_margin_bps: number;
  liquidation_threshold_bps: number;
  taker_fee_bps: number;
  maker_fee_bps: number;
  funding_fee_bps: number;
  spread_bps: number;
  liquidity_factor: number;
  slippage_max_bps: number;
  min_order_size: number;
  max_order_size: number | null;
  max_position_size: number | null;
  max_open_positions: number | null;
  price_source: string;
  price_source_symbol: string | null;
  backup_price_source: string | null;
  price_deviation_max_bps: number;
  flash_crash_protection: boolean;
  weekend_trading: boolean;
  override: { symbol: string; override_price: number; expires_at: string | null } | null;
};

const CATEGORIES = ["crypto", "forex", "indices", "commodities"] as const;
type Cat = typeof CATEGORIES[number];

function MarketOpsPage() {
  const list = useServerFn(listMarketsFull);
  const events = useServerFn(recentMarketEvents);
  const qc = useQueryClient();
  const [cat, setCat] = useState<Cat>("crypto");
  const [filter, setFilter] = useState("");

  const markets = useQuery({
    queryKey: ["market-ops"],
    queryFn: () => list(),
    refetchInterval: 5000,
  });
  const eventsQ = useQuery({
    queryKey: ["market-events"],
    queryFn: () => events(),
    refetchInterval: 6000,
  });

  const filtered = useMemo(() => {
    return ((markets.data as Market[] | undefined) ?? [])
      .filter((m) => m.category === cat)
      .filter((m) => !filter || m.symbol.toLowerCase().includes(filter.toLowerCase()));
  }, [markets.data, cat, filter]);

  const counts = useMemo(() => {
    const all = (markets.data as Market[] | undefined) ?? [];
    const acc: Record<string, { total: number; active: number; paused: number; hidden: number }> = {};
    for (const c of CATEGORIES) acc[c] = { total: 0, active: 0, paused: 0, hidden: 0 };
    all.forEach((m) => {
      const k = acc[m.category] ?? (acc[m.category] = { total: 0, active: 0, paused: 0, hidden: 0 });
      k.total++;
      if (m.status === "active") k.active++;
      if (m.status === "paused") k.paused++;
      if (m.hidden_from_frontend) k.hidden++;
    });
    return acc;
  }, [markets.data]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      {/* Top bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center gap-4">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">
            ◉ Stratos Global — Market Operations
          </div>
          <div className="ml-auto text-[11px] text-zinc-500 uppercase tracking-wider">
            {Object.entries(counts).map(([c, v]) => (
              <span key={c} className="mr-4">
                {c}: <span className="text-zinc-200">{v.active}</span>/<span className="text-zinc-400">{v.total}</span>
                {v.paused > 0 && <span className="text-amber-400 ml-1">⏸{v.paused}</span>}
                {v.hidden > 0 && <span className="text-fuchsia-400 ml-1">⊘{v.hidden}</span>}
              </span>
            ))}
          </div>
          <Link to="/admin" className="text-xs text-zinc-400 hover:text-emerald-400 uppercase">
            ← Control Center
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] p-6 space-y-4">
        {/* Category tabs + bulk actions */}
        <Tabs value={cat} onValueChange={(v) => setCat(v as Cat)}>
          <div className="flex items-center gap-4">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c} value={c} className="uppercase tracking-wider text-xs data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">
                  {c} <span className="ml-2 text-zinc-500">{counts[c]?.total ?? 0}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <Input
              placeholder="Filter symbol…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
            />
            <div className="ml-auto flex gap-2">
              <CategoryAction cat={cat} action="pause_all" label="⏸ Pause all" variant="destructive" onDone={() => qc.invalidateQueries({ queryKey: ["market-ops"] })} />
              <CategoryAction cat={cat} action="resume_all" label="▶ Resume all" onDone={() => qc.invalidateQueries({ queryKey: ["market-ops"] })} />
              <CategoryAction cat={cat} action="hide_all" label="⊘ Hide all" variant="secondary" onDone={() => qc.invalidateQueries({ queryKey: ["market-ops"] })} />
              <CategoryAction cat={cat} action="unhide_all" label="◉ Show all" variant="secondary" onDone={() => qc.invalidateQueries({ queryKey: ["market-ops"] })} />
            </div>
          </div>

          {CATEGORIES.map((c) => (
            <TabsContent key={c} value={c} className="mt-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="border-b border-zinc-800">
                  <CardTitle className="text-sm uppercase tracking-wider text-zinc-300">
                    {c} instruments — {filtered.length} listed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <MarketTable rows={filtered} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Event feed */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="border-b border-zinc-800">
            <CardTitle className="text-sm uppercase tracking-wider text-zinc-300">Market event stream</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-72">
              <div className="divide-y divide-zinc-800">
                {(eventsQ.data ?? []).map((e) => (
                  <div key={e.id} className="grid grid-cols-[140px_120px_160px_1fr_180px] gap-3 px-4 py-2 text-[11px]">
                    <span className="text-zinc-500">{new Date(e.created_at).toISOString().replace("T", " ").slice(0, 19)}</span>
                    <span className="text-emerald-400">{e.symbol}</span>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-300 justify-self-start">{e.event_type}</Badge>
                    <span className="text-zinc-400 truncate">{e.details_json}</span>
                    <span className="text-zinc-500 text-right">{e.actor_email ?? "system"}</span>
                  </div>
                ))}
                {(!eventsQ.data || eventsQ.data.length === 0) && (
                  <div className="px-4 py-8 text-center text-zinc-600 text-xs">No market events yet.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CategoryAction({
  cat, action, label, variant, onDone,
}: {
  cat: Cat;
  action: "pause_all" | "resume_all" | "hide_all" | "unhide_all";
  label: string;
  variant?: "destructive" | "secondary";
  onDone: () => void;
}) {
  const run = useServerFn(marketCategoryAction);
  const m = useMutation({
    mutationFn: () => run({ data: { category: cat, action } }),
    onSuccess: () => { toast.success(`${label} applied to ${cat}`); onDone(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Button size="sm" variant={variant ?? "outline"} disabled={m.isPending} onClick={() => m.mutate()}
      className="text-xs uppercase tracking-wider">
      {label}
    </Button>
  );
}

function MarketTable({ rows }: { rows: Market[] }) {
  return (
    <div className="divide-y divide-zinc-800">
      <div className="grid grid-cols-[160px_90px_90px_140px_120px_120px_100px_1fr] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
        <div>Symbol</div>
        <div>Status</div>
        <div>Visibility</div>
        <div>Trading</div>
        <div>Leverage</div>
        <div>Fees (bps)</div>
        <div>Source</div>
        <div className="text-right">Actions</div>
      </div>
      {rows.map((m) => (
        <MarketRow key={m.symbol} m={m} />
      ))}
      {rows.length === 0 && (
        <div className="px-4 py-8 text-center text-zinc-600 text-xs">No instruments match.</div>
      )}
    </div>
  );
}

function MarketRow({ m }: { m: Market }) {
  const qc = useQueryClient();
  const emergency = useServerFn(marketEmergencyAction);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["market-ops"] });
  type EmergencyAction =
    | "pause" | "resume" | "shutdown" | "maintenance_on" | "maintenance_off"
    | "hide" | "unhide" | "freeze_price" | "unfreeze_price"
    | "halt_buy" | "halt_sell" | "resume_buy" | "resume_sell";
  const run = (action: EmergencyAction) =>
    emergency({ data: { symbol: m.symbol, action } })
      .then(() => { toast.success(`${m.symbol}: ${action}`); invalidate(); })
      .catch((e) => toast.error((e as Error).message));

  const statusColor =
    m.status === "active" ? "text-emerald-400" : m.status === "paused" ? "text-amber-400" : "text-zinc-500";

  return (
    <div className="grid grid-cols-[160px_90px_90px_140px_120px_120px_100px_1fr] gap-3 px-4 py-2.5 text-xs items-center hover:bg-zinc-800/30">
      <div>
        <div className="text-zinc-100">{m.symbol}</div>
        <div className="text-[10px] text-zinc-500">{m.display_name ?? `${m.base_asset}/${m.quote_asset}`}</div>
      </div>
      <div className={`uppercase ${statusColor}`}>
        {m.status}{m.maintenance_mode && " ⚠"}
      </div>
      <div className={m.hidden_from_frontend ? "text-fuchsia-400" : "text-zinc-400"}>
        {m.hidden_from_frontend ? "Hidden" : "Visible"}
      </div>
      <div className="flex gap-1">
        <span className={m.buy_enabled ? "text-emerald-400" : "text-red-400"}>BUY</span>
        <span className="text-zinc-700">/</span>
        <span className={m.sell_enabled ? "text-emerald-400" : "text-red-400"}>SELL</span>
        {m.price_frozen && <span className="text-amber-400 ml-1">❄</span>}
      </div>
      <div className="tabular-nums text-zinc-300">{m.min_leverage}x — {m.max_leverage}x</div>
      <div className="tabular-nums text-zinc-400">
        T{m.taker_fee_bps}/M{m.maker_fee_bps}/S{m.spread_bps}
      </div>
      <div className="text-zinc-500">{m.price_source}</div>
      <div className="flex gap-1 justify-end">
        {m.status === "active" ? (
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => run("pause")}>⏸ Pause</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-[10px] text-emerald-400" onClick={() => run("resume")}>▶ Resume</Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => run(m.hidden_from_frontend ? "unhide" : "hide")}>
          {m.hidden_from_frontend ? "◉ Show" : "⊘ Hide"}
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => run("shutdown")}>⛔ Shutdown</Button>
        <MarketConfigDialog m={m} />
      </div>
    </div>
  );
}

function MarketConfigDialog({ m }: { m: Market }) {
  const qc = useQueryClient();
  const upd = useServerFn(updateMarket);
  const ovr = useServerFn(setPriceOverride);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(m);
  const [overridePrice, setOverridePrice] = useState<string>(m.override?.override_price?.toString() ?? "");

  const saveMut = useMutation({
    mutationFn: () => upd({
      data: {
        symbol: m.symbol,
        buy_enabled: form.buy_enabled, sell_enabled: form.sell_enabled,
        leverage_enabled: form.leverage_enabled,
        market_order_enabled: form.market_order_enabled,
        limit_order_enabled: form.limit_order_enabled,
        stop_order_enabled: form.stop_order_enabled,
        tp_sl_enabled: form.tp_sl_enabled,
        trailing_stop_enabled: form.trailing_stop_enabled,
        max_leverage: Number(form.max_leverage),
        min_leverage: Number(form.min_leverage),
        maintenance_margin_bps: Number(form.maintenance_margin_bps),
        liquidation_threshold_bps: Number(form.liquidation_threshold_bps),
        taker_fee_bps: Number(form.taker_fee_bps),
        maker_fee_bps: Number(form.maker_fee_bps),
        funding_fee_bps: Number(form.funding_fee_bps),
        spread_bps: Number(form.spread_bps),
        liquidity_factor: Number(form.liquidity_factor),
        slippage_max_bps: Number(form.slippage_max_bps),
        min_order_size: Number(form.min_order_size),
        max_order_size: form.max_order_size === null ? null : Number(form.max_order_size),
        max_position_size: form.max_position_size === null ? null : Number(form.max_position_size),
        max_open_positions: form.max_open_positions === null ? null : Number(form.max_open_positions),
        price_source: form.price_source as "binance" | "external" | "manual",
        price_source_symbol: form.price_source_symbol,
        backup_price_source: form.backup_price_source,
        price_deviation_max_bps: Number(form.price_deviation_max_bps),
        flash_crash_protection: form.flash_crash_protection,
        weekend_trading: form.weekend_trading,
        maintenance_mode: form.maintenance_mode,
        maintenance_message: null,
      },
    }),
    onSuccess: () => {
      toast.success(`${m.symbol} configuration saved`);
      qc.invalidateQueries({ queryKey: ["market-ops"] });
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const overrideMut = useMutation({
    mutationFn: () => ovr({
      data: {
        symbol: m.symbol,
        override_price: overridePrice === "" ? null : Number(overridePrice),
        expires_in_min: 60,
      },
    }),
    onSuccess: () => { toast.success("Price override updated"); qc.invalidateQueries({ queryKey: ["market-ops"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px]">⚙ Configure</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl bg-zinc-950 border-zinc-800 text-zinc-100 font-mono">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-emerald-400">
            {m.symbol} — Operational Control
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="trading">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="trading" className="text-xs uppercase">Trading</TabsTrigger>
            <TabsTrigger value="orders" className="text-xs uppercase">Orders</TabsTrigger>
            <TabsTrigger value="leverage" className="text-xs uppercase">Leverage</TabsTrigger>
            <TabsTrigger value="fees" className="text-xs uppercase">Fees</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs uppercase">Risk</TabsTrigger>
            <TabsTrigger value="feed" className="text-xs uppercase">Price feed</TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="space-y-3 pt-4">
            <Toggle label="Buy enabled" v={form.buy_enabled} on={(v) => setForm({ ...form, buy_enabled: v })} />
            <Toggle label="Sell enabled" v={form.sell_enabled} on={(v) => setForm({ ...form, sell_enabled: v })} />
            <Toggle label="Leverage enabled" v={form.leverage_enabled} on={(v) => setForm({ ...form, leverage_enabled: v })} />
            <Toggle label="Maintenance mode" v={form.maintenance_mode} on={(v) => setForm({ ...form, maintenance_mode: v })} />
            <Toggle label="Weekend trading" v={form.weekend_trading} on={(v) => setForm({ ...form, weekend_trading: v })} />
          </TabsContent>

          <TabsContent value="orders" className="space-y-3 pt-4">
            <Toggle label="Market orders" v={form.market_order_enabled} on={(v) => setForm({ ...form, market_order_enabled: v })} />
            <Toggle label="Limit orders" v={form.limit_order_enabled} on={(v) => setForm({ ...form, limit_order_enabled: v })} />
            <Toggle label="Stop orders" v={form.stop_order_enabled} on={(v) => setForm({ ...form, stop_order_enabled: v })} />
            <Toggle label="TP / SL" v={form.tp_sl_enabled} on={(v) => setForm({ ...form, tp_sl_enabled: v })} />
            <Toggle label="Trailing stop" v={form.trailing_stop_enabled} on={(v) => setForm({ ...form, trailing_stop_enabled: v })} />
            <NumField label="Min order size" v={form.min_order_size} on={(v) => setForm({ ...form, min_order_size: v as number })} />
            <NumField label="Max order size" v={form.max_order_size} nullable on={(v) => setForm({ ...form, max_order_size: v })} />
            <NumField label="Max position size" v={form.max_position_size} nullable on={(v) => setForm({ ...form, max_position_size: v })} />
            <NumField label="Max open positions" v={form.max_open_positions} nullable on={(v) => setForm({ ...form, max_open_positions: v as number | null })} />
          </TabsContent>

          <TabsContent value="leverage" className="space-y-3 pt-4">
            <NumField label="Min leverage (x)" v={form.min_leverage} on={(v) => setForm({ ...form, min_leverage: v as number })} />
            <NumField label="Max leverage (x)" v={form.max_leverage} on={(v) => setForm({ ...form, max_leverage: v as number })} />
            <NumField label="Maintenance margin (bps)" v={form.maintenance_margin_bps} on={(v) => setForm({ ...form, maintenance_margin_bps: v as number })} />
            <NumField label="Liquidation threshold (bps)" v={form.liquidation_threshold_bps} on={(v) => setForm({ ...form, liquidation_threshold_bps: v as number })} />
          </TabsContent>

          <TabsContent value="fees" className="space-y-3 pt-4">
            <NumField label="Taker fee (bps)" v={form.taker_fee_bps} on={(v) => setForm({ ...form, taker_fee_bps: v as number })} />
            <NumField label="Maker fee (bps)" v={form.maker_fee_bps} on={(v) => setForm({ ...form, maker_fee_bps: v as number })} />
            <NumField label="Funding fee (bps / 8h)" v={form.funding_fee_bps} on={(v) => setForm({ ...form, funding_fee_bps: v as number })} />
            <NumField label="Spread (bps)" v={form.spread_bps} on={(v) => setForm({ ...form, spread_bps: v as number })} />
          </TabsContent>

          <TabsContent value="risk" className="space-y-3 pt-4">
            <NumField label="Liquidity factor" v={form.liquidity_factor} on={(v) => setForm({ ...form, liquidity_factor: v as number })} />
            <NumField label="Max slippage (bps)" v={form.slippage_max_bps} on={(v) => setForm({ ...form, slippage_max_bps: v as number })} />
            <NumField label="Max price deviation (bps)" v={form.price_deviation_max_bps} on={(v) => setForm({ ...form, price_deviation_max_bps: v as number })} />
            <Toggle label="Flash-crash protection" v={form.flash_crash_protection} on={(v) => setForm({ ...form, flash_crash_protection: v })} />
          </TabsContent>

          <TabsContent value="feed" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase text-zinc-500">Primary source</Label>
                <select value={form.price_source} onChange={(e) => setForm({ ...form, price_source: e.target.value })}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs">
                  <option value="binance">binance</option>
                  <option value="external">external</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-zinc-500">Source symbol</Label>
                <Input value={form.price_source_symbol ?? ""} onChange={(e) => setForm({ ...form, price_source_symbol: e.target.value })}
                  className="bg-zinc-900 border-zinc-800 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-zinc-500">Backup source</Label>
                <Input value={form.backup_price_source ?? ""} onChange={(e) => setForm({ ...form, backup_price_source: e.target.value })}
                  className="bg-zinc-900 border-zinc-800 text-xs mt-1" />
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-3 mt-3">
              <Label className="text-[10px] uppercase text-amber-400">Manual price override (60 min)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)}
                  placeholder="Leave empty to clear"
                  className="bg-zinc-900 border-zinc-800 text-xs" />
                <Button size="sm" variant="outline" onClick={() => overrideMut.mutate()}
                  disabled={overrideMut.isPending} className="text-[10px] uppercase">
                  Apply override
                </Button>
              </div>
              {m.override && (
                <div className="text-[10px] text-zinc-500 mt-2">
                  Current: {m.override.override_price} {m.override.expires_at && `(expires ${new Date(m.override.expires_at).toLocaleString()})`}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-zinc-800 pt-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 uppercase tracking-wider text-xs">
            Save configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border border-zinc-800 rounded px-3 py-2">
      <span className="text-xs text-zinc-300">{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}

function NumField({
  label, v, on, nullable,
}: {
  label: string;
  v: number | null;
  on: (v: number | null) => void;
  nullable?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_180px] items-center gap-3 border border-zinc-800 rounded px-3 py-2">
      <Label className="text-xs text-zinc-300">{label}</Label>
      <Input
        type="number"
        value={v ?? ""}
        onChange={(e) => {
          const s = e.target.value;
          if (s === "") on(nullable ? null : 0);
          else on(Number(s));
        }}
        className="bg-zinc-900 border-zinc-800 text-xs tabular-nums"
      />
    </div>
  );
}
