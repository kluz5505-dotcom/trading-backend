import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FeedStats, MarketCandlePoint, MarketOrderBookSnapshot, MarketSnapshot, MarketTradeTick, RealtimeNotification } from "../types";
import type { Json } from "@/integrations/supabase/types";

type MarketControl = {
  symbol: string;
  status?: "active" | "paused" | "delisted" | string;
  maintenance_mode?: boolean;
  hidden_from_frontend?: boolean;
  spread_bps?: number;
  price_source?: string | null;
  price_source_symbol?: string | null;
  market_type?: string | null;
  category?: string | null;
  max_leverage?: number | null;
  buy_enabled?: boolean | null;
  sell_enabled?: boolean | null;
  active_override?: number | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function coerceString(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return undefined;
}

function coerceNumber(x: unknown): number | undefined {
  if (typeof x === "number") return x;
  if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x))) return Number(x);
  return undefined;
}

function coerceBoolean(x: unknown): boolean | undefined {
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return Boolean(x);
  if (typeof x === "string") {
    if (x === "true") return true;
    if (x === "false") return false;
  }
  return undefined;
}

function marketControlToJson(c: MarketControl): Record<string, Json> {
  const out: Record<string, Json> = {
    symbol: c.symbol,
    status: c.status ?? null,
    maintenance_mode: c.maintenance_mode ?? false,
    hidden_from_frontend: c.hidden_from_frontend ?? false,
    spread_bps: c.spread_bps ?? null,
    price_source: c.price_source ?? null,
    price_source_symbol: c.price_source_symbol ?? null,
    market_type: c.market_type ?? null,
    category: c.category ?? null,
    max_leverage: c.max_leverage ?? null,
    buy_enabled: c.buy_enabled ?? null,
    sell_enabled: c.sell_enabled ?? null,
    active_override: c.active_override ?? null,
  };
  return out;
}

const BinanaceWebSocketURL = "wss://stream.binance.com:9443/stream?streams=";

// Supported markets are loaded dynamically from the `markets` DB table.
// The static list was removed because it limited updates to a hardcoded set.

const TIMEFRAMES = ["1m", "5m", "15m", "1h"];

type SupportedMarket = DynamicSupportedMarket;

type DynamicSupportedMarket = {
  symbol: string;
  display_name: string | null;
  market_type: string | null;
  category: string | null;
  provider: string | null;
  binance_symbol?: string | null;
  provider_symbol?: string | null;
};

type EventListener = (payload: { type: string; symbol?: string; snapshot?: MarketSnapshot; notifications?: RealtimeNotification[]; stats?: FeedStats }) => void;

class LiveMarketEngine {
  private supportedMarkets: DynamicSupportedMarket[] = [];
  private snapshots = new Map<string, MarketSnapshot>();
  private controls = new Map<string, MarketControl>();
  private listeners = new Set<EventListener>();
  private ws: { close: () => void; ping: () => void; on: (event: string, cb: (...args: unknown[]) => void) => void; readyState?: number } | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnects = 0;
  private heartBeatTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatStartedAt: number | null = null;
  private lastHeartbeat = null as string | null;
  private lastUpdate = null as string | null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.bootstrapSnapshots();
    this.connect();
    this.startFallbackRefresh();
    this.startHeartbeat();
  }

  on(listener: EventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: Parameters<EventListener>[0]) {
    for (const listener of this.listeners) listener(payload);
  }

  getSnapshot(symbols?: string[]) {
    if (!symbols?.length) {
      return Array.from(this.snapshots.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
    return symbols.map((symbol) => this.snapshots.get(symbol)).filter((entry): entry is MarketSnapshot => Boolean(entry));
  }

  getStats(): FeedStats {
    return {
      active_symbols: this.snapshots.size,
      ws_connected: Boolean(this.ws && this.ws.readyState === 1),
      reconnects: this.reconnects,
      heartbeat_ms: this.heartbeatStartedAt ? Date.now() - this.heartbeatStartedAt : 0,
      last_heartbeat: this.lastHeartbeat,
      last_update: this.lastUpdate,
      source_health: Object.fromEntries(Array.from(this.snapshots.values()).map((snapshot) => {
        const metadata = snapshot.metadata as { fetch_status?: "healthy" | "degraded" | "offline" } | null;
        return [snapshot.symbol, metadata?.fetch_status ?? "healthy"];
      })),
      active_timeframes: TIMEFRAMES,
    };
  }

  getNotifications() {
    return Array.from(this.notifications.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private notifications = new Map<string, RealtimeNotification>();

  private async bootstrapSnapshots() {
    await this.refreshControls();
    // load active markets from DB
    this.supportedMarkets = await this.loadSupportedMarketsFromDb();
    for (const market of this.supportedMarkets) {
      const snapshot = await this.fetchSnapshot(market as SupportedMarket);
      this.snapshots.set(market.symbol, snapshot);
    }
    this.emit({ type: "snapshot.bootstrap", snapshot: undefined, notifications: Array.from(this.notifications.values()) });
  }

  private async refreshControls() {
    const [marketsResult, overridesResult] = await Promise.all([
      supabaseAdmin.from("markets").select("symbol, status, maintenance_mode, hidden_from_frontend, spread_bps, price_source, price_source_symbol, market_type, category, max_leverage, buy_enabled, sell_enabled").order("symbol"),
      supabaseAdmin.from("market_price_overrides").select("symbol, override_price, expires_at").order("created_at", { ascending: false }),
    ]);

    if (marketsResult.error) throw new Error(marketsResult.error.message);
    if (overridesResult.error) throw new Error(overridesResult.error.message);

    const overridesBySymbol = new Map((overridesResult.data ?? []).map((entry) => [entry.symbol, entry]));
    const controls = new Map<string, MarketControl>();
    for (const marketRow of marketsResult.data ?? []) {
      if (!isRecord(marketRow)) continue;
      const symbol = coerceString(marketRow.symbol) ?? "";
      const override = overridesBySymbol.get(symbol);
      let activeOverride: number | null = null;
      if (isRecord(override)) {
        const expires = override.expires_at;
        const notExpired = !expires || (typeof expires === "string" ? new Date(expires).getTime() > Date.now() : typeof expires === "number" ? expires > Date.now() : false);
        if (notExpired) {
          activeOverride = coerceNumber(override.override_price) ?? null;
        }
      }

      const control: MarketControl = {
        symbol,
        status: coerceString(marketRow.status) ?? undefined,
        maintenance_mode: coerceBoolean(marketRow.maintenance_mode) ?? false,
        hidden_from_frontend: coerceBoolean(marketRow.hidden_from_frontend) ?? false,
        spread_bps: coerceNumber(marketRow.spread_bps) ?? undefined,
        price_source: coerceString(marketRow.price_source) ?? null,
        price_source_symbol: coerceString(marketRow.price_source_symbol) ?? null,
        market_type: coerceString(marketRow.market_type) ?? null,
        category: coerceString(marketRow.category) ?? null,
        max_leverage: coerceNumber(marketRow.max_leverage) ?? null,
        buy_enabled: coerceBoolean(marketRow.buy_enabled) ?? null,
        sell_enabled: coerceBoolean(marketRow.sell_enabled) ?? null,
        active_override: activeOverride,
      };
      controls.set(control.symbol, control);
    }
    this.controls = controls;
    // refresh supported markets mapping as well
    this.supportedMarkets = await this.loadSupportedMarketsFromDb();
  }

  private normalizeForBinance(sym: string | undefined) {
    if (!sym) return null;
    // remove non-alphanumeric chars (slashes, dashes) and uppercase
    return sym.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  }

  private async loadSupportedMarketsFromDb(): Promise<DynamicSupportedMarket[]> {
    const { data, error } = await supabaseAdmin
      .from("markets")
      .select("symbol, display_name, market_type, category, price_source, price_source_symbol, price_source_symbol as provider_symbol, price_source as provider")
      .eq("status", "active")
      .order("symbol");
    if (error) {
      console.error("Failed to load markets for live feed", error);
      return [];
    }
    return (data ?? []).map((row: any) => {
      const binanceSymbol = row.price_source === "binance" ? (row.price_source_symbol || this.normalizeForBinance(row.symbol)) : null;
      return {
        symbol: row.symbol,
        display_name: row.display_name ?? row.symbol,
        market_type: row.market_type ?? null,
        category: row.category ?? null,
        provider: row.price_source ?? null,
        binance_symbol: binanceSymbol,
        provider_symbol: row.provider_symbol ?? null,
      } as DynamicSupportedMarket;
    });
  }

  private async fetchSnapshot(market: SupportedMarket): Promise<MarketSnapshot> {
    const control = this.controls.get(market.symbol);
    const now = new Date().toISOString();
    const fallback = await this.fetchRestSnapshot(market);
    const previous = this.snapshots.get(market.symbol);
    const price = control?.active_override != null ? Number(control.active_override) : fallback.price;
    const previousPrice = previous?.price ?? price;
    const change_percent = previousPrice ? ((price - previousPrice) / previousPrice) * 100 : 0;
    const defaultSpread = market.market_type === "forex" ? 2 : market.market_type === "indices" ? 5 : market.market_type === "commodities" ? 8 : 6;
    const spreads = Number(control?.spread_bps ?? defaultSpread);
    const orderbook = this.buildOrderBook(price, spreads, fallback.orderbook, market.symbol);
    const candles = this.buildCandles(price, fallback.candles);
    const trades = fallback.trades.slice(0, 10);

    const status = control?.maintenance_mode ? "maintenance" : control?.hidden_from_frontend ? "hidden" : control?.status === "paused" ? "paused" : control?.status === "delisted" ? "delisted" : "active";

    const provider_symbol = 'provider_symbol' in market ? market.provider_symbol : 'binance_symbol' in market ? market.binance_symbol : undefined;

    const snapshot: MarketSnapshot = {
      symbol: market.symbol,
      display_name: market.display_name,
      market_type: market.market_type,
      category: market.category,
      price,
      previous_price: previousPrice,
      change_percent,
      volume: fallback.volume,
      high: Math.max(previous?.high ?? price, fallback.high),
      low: Math.min(previous?.low ?? price, fallback.low),
      spread_bps: spreads,
      orderbook,
      candles,
      trades,
      source: market.provider,
      status,
      last_updated: now,
      latency_ms: fallback.latency_ms,
      update_count: (previous?.update_count ?? 0) + 1,
      metadata: {
        fetch_status: fallback.source_status,
        provider_symbol: provider_symbol ?? null,
        market_controls: control ? marketControlToJson(control) : null,
      },
    };

    if (Math.abs(change_percent) >= 1) {
      const id = `${market.symbol}-${Date.now()}`;
      const notification: RealtimeNotification = {
        id,
        severity: Math.abs(change_percent) >= 3 ? "critical" : "warning",
        title: `${market.display_name} moved ${change_percent >= 0 ? "+" : ""}${change_percent.toFixed(2)}%`,
        description: `${market.display_name} is now ${price.toFixed(2)} after ${Math.abs(change_percent).toFixed(2)}% move.`,
        created_at: now,
        symbol: market.symbol,
        metadata: { change_percent, price },
      };
      this.notifications.set(id, notification);
      this.emit({ type: "notification", notifications: [notification] });
    }

    this.snapshots.set(market.symbol, snapshot);
    this.lastUpdate = now;
    return snapshot;
  }

  private async fetchRestSnapshot(market: SupportedMarket): Promise<{ price:number; volume:number; high:number; low:number; orderbook: MarketOrderBookSnapshot; candles: Record<string, MarketCandlePoint[]>; trades: MarketTradeTick[]; latency_ms:number; source_status:"healthy"|"degraded"|"offline" }> {
    const startedAt = Date.now();
    try {
      if (market.provider === "binance") {
        const [tickerResponse, depthResponse] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${market.binance_symbol!.toUpperCase()}`),
          fetch(`https://api.binance.com/api/v3/depth?symbol=${market.binance_symbol!.toUpperCase()}&limit=20`),
        ]);
        const ticker = await tickerResponse.json();
        const depth = await depthResponse.json();
        const price = Number(ticker.lastPrice ?? ticker.c ?? 0);
        const volume = Number(ticker.quoteVolume ?? ticker.volume ?? 0);
        const high = Number(ticker.highPrice ?? price);
        const low = Number(ticker.lowPrice ?? price);
        const orderbook = this.parseDepthSnapshot(depth, market.symbol);
        const candles = TIMEFRAMES.reduce<Record<string, MarketCandlePoint[]>>((acc, timeframe) => {
          acc[timeframe] = this.buildSyntheticCandles(price, timeframe, market.symbol);
          return acc;
        }, {});
        const trades = this.buildSyntheticTrades(price, market.symbol);
        return {
          price,
          volume,
          high,
          low,
          orderbook,
          candles,
          trades,
          latency_ms: Date.now() - startedAt,
          source_status: "healthy",
        };
      }

      if (market.provider === "fx") {
        const response = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${market.provider_symbol}`);
        const data = await response.json();
        const rate = Number(data.rates?.[market.provider_symbol] ?? 1);
        const price = market.symbol === "EURUSD" || market.symbol === "GBPUSD" || market.symbol === "AUDUSD" || market.symbol === "NZDUSD" ? (1 / rate) : rate;
        const orderbook = this.buildSyntheticOrderBook(price, market.symbol);
        const candles = TIMEFRAMES.reduce<Record<string, MarketCandlePoint[]>>((acc, timeframe) => {
          acc[timeframe] = this.buildSyntheticCandles(price, timeframe, market.symbol);
          return acc;
        }, {});
        const trades = this.buildSyntheticTrades(price, market.symbol);
        return {
          price,
          volume: 1000000,
          high: price,
          low: price,
          orderbook,
          candles,
          trades,
          latency_ms: Date.now() - startedAt,
          source_status: "healthy",
        };
      }

      const alphaKey = process.env.ALPHAVANTAGE_API_KEY ?? "demo";
      const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(market.provider_symbol!)}&apikey=${alphaKey}`);
      const data = await response.json();
      if (data["Global Quote"]) {
        const quote = data["Global Quote"];
        const price = Number(quote["05. price"] ?? quote["05. price"] ?? 0);
        const volume = Number(quote["06. volume"] ?? 0);
        const orderbook = this.buildSyntheticOrderBook(price, market.symbol);
        const candles = TIMEFRAMES.reduce<Record<string, MarketCandlePoint[]>>((acc, timeframe) => {
          acc[timeframe] = this.buildSyntheticCandles(price, timeframe, market.symbol);
          return acc;
        }, {});
        const trades = this.buildSyntheticTrades(price, market.symbol);
        return {
          price,
          volume,
          high: price,
          low: price,
          orderbook,
          candles,
          trades,
          latency_ms: Date.now() - startedAt,
          source_status: "healthy",
        };
      }

      return {
        price: this.snapshots.get(market.symbol)?.price ?? 0,
        volume: this.snapshots.get(market.symbol)?.volume ?? 0,
        high: this.snapshots.get(market.symbol)?.high ?? 0,
        low: this.snapshots.get(market.symbol)?.low ?? 0,
        orderbook: this.snapshots.get(market.symbol)?.orderbook ?? this.buildSyntheticOrderBook(0, market.symbol),
        candles: this.snapshots.get(market.symbol)?.candles ?? {},
        trades: this.snapshots.get(market.symbol)?.trades ?? [],
        latency_ms: Date.now() - startedAt,
        source_status: "degraded",
      };
    } catch (error) {
      const stale = this.snapshots.get(market.symbol);
      return {
        price: stale?.price ?? 0,
        volume: stale?.volume ?? 0,
        high: stale?.high ?? 0,
        low: stale?.low ?? 0,
        orderbook: stale?.orderbook ?? this.buildSyntheticOrderBook(0, market.symbol),
        candles: stale?.candles ?? {},
        trades: stale?.trades ?? [],
        latency_ms: Date.now() - startedAt,
        source_status: "offline",
      };
    }
  }

  private buildOrderBook(price: number, spreads: number, orderbook: MarketOrderBookSnapshot | null, symbol: string): MarketOrderBookSnapshot {
    return orderbook ?? this.buildSyntheticOrderBook(price, symbol);
  }

  private buildCandles(price: number, candles: Record<string, MarketCandlePoint[]>): Record<string, MarketCandlePoint[]> {
    return candles;
  }

  private buildSyntheticOrderBook(midPrice: number, symbol: string): MarketOrderBookSnapshot {
    const spread = symbol === "EURUSD" || symbol === "GBPUSD" || symbol === "AUDUSD" || symbol === "NZDUSD" ? 2 : symbol === "USDJPY" || symbol === "USDCHF" || symbol === "USDCAD" ? 2 : symbol === "SPX500" || symbol === "NAS100" || symbol === "US30" || symbol === "UK100" || symbol === "GER40" || symbol === "JPN225" ? 5 : 8;
    const spreadPrice = midPrice * (spread / 10000);
    return {
      bids: [
        { price: midPrice - spreadPrice, quantity: Math.max(1, midPrice * 0.1) },
        { price: midPrice - spreadPrice * 1.5, quantity: Math.max(1, midPrice * 0.08) },
        { price: midPrice - spreadPrice * 2, quantity: Math.max(1, midPrice * 0.06) },
      ],
      asks: [
        { price: midPrice + spreadPrice, quantity: Math.max(1, midPrice * 0.1) },
        { price: midPrice + spreadPrice * 1.5, quantity: Math.max(1, midPrice * 0.08) },
        { price: midPrice + spreadPrice * 2, quantity: Math.max(1, midPrice * 0.06) },
      ],
      spread_bps: spread,
      depth: 3,
      source: "synthetic-depth",
      updated_at: new Date().toISOString(),
    };
  }

  private buildSyntheticCandles(price: number, timeframe: string, symbol: string): MarketCandlePoint[] {
    const now = Date.now();
    const step = timeframe === "1m" ? 60_000 : timeframe === "5m" ? 300_000 : timeframe === "15m" ? 900_000 : 3_600_000;
    const candle = {
      timeframe,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: Math.max(1000, price * 10),
      start_time: new Date(now - step).toISOString(),
      end_time: new Date(now).toISOString(),
    };
    return [candle];
  }

  private buildSyntheticTrades(price: number, symbol: string): MarketTradeTick[] {
    const now = new Date().toISOString();
    return [
      { id: `${symbol}-${Date.now()}-1`, price, quantity: Math.max(0.01, price / 10000), side: "buy", timestamp: now, source: "derived" },
    ];
  }

  private parseDepthSnapshot(depth: { bids: [string, string][]; asks: [string, string][] }, symbol: string): MarketOrderBookSnapshot {
    const bids = (depth.bids ?? []).slice(0, 5).map(([price, qty]) => ({ price: Number(price), quantity: Number(qty) }));
    const asks = (depth.asks ?? []).slice(0, 5).map(([price, qty]) => ({ price: Number(price), quantity: Number(qty) }));
    const spread = asks[0] && bids[0] ? ((asks[0].price - bids[0].price) / bids[0].price) * 10000 : 0;
    return {
      bids,
      asks,
      spread_bps: Number(spread.toFixed(2)),
      depth: 5,
      source: "binance-depth",
      updated_at: new Date().toISOString(),
    };
  }

  private connect() {
    const streams = this.supportedMarkets
      .filter((market) => market.provider === "binance" && market.binance_symbol)
      .flatMap((market) => [
        `${market.binance_symbol}@ticker`,
        `${market.binance_symbol}@trade`,
        `${market.binance_symbol}@depth@100ms`,
        `${market.binance_symbol}@kline_1m`,
        `${market.binance_symbol}@kline_5m`,
        `${market.binance_symbol}@kline_15m`,
        `${market.binance_symbol}@kline_1h`,
      ]);

    if (!streams.length) return;

    const wsUrl = `${BinanaceWebSocketURL}${streams.join("/")}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.on("open", () => {
      this.reconnects = 0;
      this.lastHeartbeat = new Date().toISOString();
      this.emit({ type: "stream.connected" });
    });
    this.ws.on("message", (raw) => this.handleWebSocketPayload(raw));
    this.ws.on("ping", () => {
      this.lastHeartbeat = new Date().toISOString();
    });
    this.ws.on("close", () => {
      this.emit({ type: "stream.closed" });
      this.scheduleReconnect();
    });
    this.ws.on("error", () => {
      this.emit({ type: "stream.error" });
      this.scheduleReconnect();
    });
  }

  private async handleWebSocketPayload(raw: unknown) {
    const payload = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
    const streamName = payload.stream as string;
    const data = payload.data;
    if (!data) return;

    const symbol = this.resolveSymbolFromStream(streamName);
    if (!symbol) return;

    const market = this.supportedMarkets.find((entry) => entry.symbol === symbol as string);
    if (!market) return;

    if (streamName.endsWith("@ticker")) {
      const price = Number(data.c ?? 0);
      const volume = Number(data.v ?? 0);
      const change = Number(data.P ?? 0);
      const previous = this.snapshots.get(symbol);
      const next = await this.fetchSnapshot(market);
      next.price = price;
      next.volume = volume;
      next.change_percent = change;
      next.previous_price = previous?.price ?? price;
      next.last_updated = new Date().toISOString();
      next.update_count = (previous?.update_count ?? 0) + 1;
      next.latency_ms = 0;
      next.orderbook = this.parseDepthSnapshot({ bids: data.bids ?? [], asks: data.asks ?? [] } as never, symbol);
      this.snapshots.set(symbol, next);
      this.emit({ type: "snapshot.update", symbol, snapshot: next });
      return;
    }

    if (streamName.includes("@trade")) {
      const trade: MarketTradeTick = {
        id: String(data.t ?? `${symbol}-${Date.now()}`),
        price: Number(data.p ?? 0),
        quantity: Number(data.q ?? 0),
        side: data.m ? "sell" : "buy",
        timestamp: new Date(Number(data.T ?? Date.now())).toISOString(),
        source: "binance-trade",
      };
      const snapshot = this.snapshots.get(symbol);
      if (snapshot) {
        snapshot.trades = [trade, ...snapshot.trades].slice(0, 25);
        snapshot.last_updated = new Date().toISOString();
        snapshot.update_count += 1;
        this.snapshots.set(symbol, snapshot);
        this.emit({ type: "snapshot.update", symbol, snapshot });
      }
      return;
    }

    if (streamName.includes("@depth")) {
      const snapshot = this.snapshots.get(symbol);
      if (snapshot) {
        snapshot.orderbook = this.parseDepthSnapshot({ bids: data.bids, asks: data.asks } as never, symbol);
        snapshot.last_updated = new Date().toISOString();
        snapshot.update_count += 1;
        this.snapshots.set(symbol, snapshot);
        this.emit({ type: "snapshot.update", symbol, snapshot });
      }
      return;
    }

    if (streamName.includes("@kline")) {
      const timeframe = streamName.includes("_1m") ? "1m" : streamName.includes("_5m") ? "5m" : streamName.includes("_15m") ? "15m" : "1h";
      const snapshot = this.snapshots.get(symbol);
      if (snapshot) {
        const candle: MarketCandlePoint = {
          timeframe,
          open: Number(data.k.o),
          high: Number(data.k.h),
          low: Number(data.k.l),
          close: Number(data.k.c),
          volume: Number(data.k.v),
          start_time: new Date(Number(data.k.t)).toISOString(),
          end_time: new Date(Number(data.k.T)).toISOString(),
        };
        snapshot.candles[timeframe] = [candle];
        snapshot.last_updated = new Date().toISOString();
        snapshot.update_count += 1;
        this.snapshots.set(symbol, snapshot);
        this.emit({ type: "snapshot.update", symbol, snapshot });
      }
    }
  }

  private resolveSymbolFromStream(streamName: string): string | null {
    const normalized = streamName.split("@")[0].toUpperCase();
    return this.supportedMarkets.find((market) => (market.binance_symbol ?? "").toUpperCase() === normalized)?.symbol ?? null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnects += 1;
      this.connect();
    }, Math.min(30000, 1000 * Math.pow(2, this.reconnects)));
  }

  private startFallbackRefresh() {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = setInterval(async () => {
      await this.refreshControls();
      // reload supported markets from DB in case administrators changed instruments
      this.supportedMarkets = await this.loadSupportedMarketsFromDb();
      for (const market of this.supportedMarkets) {
        const snapshot = await this.fetchSnapshot(market as SupportedMarket);
        this.snapshots.set(market.symbol, snapshot);
        this.emit({ type: "snapshot.refresh", symbol: market.symbol, snapshot });

        try {
          // persist last price and spread to markets table
          await supabaseAdmin.from("markets").update({ last_price: snapshot.price, spread_bps: snapshot.spread_bps, updated_at: new Date().toISOString() }).eq("symbol", snapshot.symbol);
        } catch (err) {
          console.warn("Failed to persist market price for", market.symbol, err);
        }
      }
    }, 60_000);
  }

  private startHeartbeat() {
    if (this.heartBeatTimer) clearInterval(this.heartBeatTimer);
    this.heartbeatStartedAt = Date.now();
    this.heartBeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.ping();
        this.lastHeartbeat = new Date().toISOString();
      }
    }, 30_000);
  }
}

const liveMarketEngine = new LiveMarketEngine();

if (typeof window === "undefined") {
  liveMarketEngine.start();
}

export { liveMarketEngine };
