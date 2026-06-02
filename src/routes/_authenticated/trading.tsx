import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTradingRealtime } from '@/lib/trading-engine/client/hooks';
import { placeSpotOrder, getUserOrders, getUserPositions } from '@/lib/trading-engine/functions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/trading')({
  component: SpotTradingRoute,
});

function SpotTradingRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tradingRealtime = useTradingRealtime();
  const placeOrder = useServerFn(placeSpotOrder);
  const fetchOrders = useServerFn(getUserOrders);
  const fetchPositions = useServerFn(getUserPositions);

  const marketsQuery = useQuery({
    queryKey: ['spot-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id,symbol,base_asset,quote_asset,market_type')
        .eq('market_type', 'spot')
        .order('symbol');
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: ['user-spot-orders', user?.id],
    queryFn: async () => await fetchOrders(),
    enabled: !!user,
    retry: false,
  });

  const positionsQuery = useQuery({
    queryKey: ['user-spot-positions', user?.id],
    queryFn: async () => await fetchPositions(),
    enabled: !!user,
    retry: false,
  });

  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit' | 'stop' | 'take_profit' | 'stop_loss'>('market');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');

  const marketOptions = marketsQuery.data ?? [];
  const selectedMarket = marketOptions.find((market) => market.symbol === symbol) ?? marketOptions[0];

  
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmitOrder() {
    try {
      if (!symbol || !quantity) throw new Error('Symbol and quantity are required');
      setIsSubmitting(true);
      const payload = {
        symbol,
        side,
        type,
        quantity: Number(quantity),
        price: type === 'market' ? null : Number(price),
        stopPrice: stopPrice ? Number(stopPrice) : null,
      };
      await placeOrder(payload);
      toast.success('Spot order submitted');
      queryClient.invalidateQueries({ queryKey: ['user-spot-orders', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-spot-positions', user?.id] });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsSubmitting(false);
    }
  }
  const formValid = Boolean(symbol && quantity && (type === 'market' || price));
  const bestOrders = ordersQuery.data ?? [];
  const positions = positionsQuery.data ?? [];

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Spot Trading</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Place spot orders and monitor your active positions in real time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New spot order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="symbol">Market</Label>
              <Select value={symbol} onValueChange={(value) => setSymbol(value)}>
                <SelectTrigger id="symbol">
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent>
                  {marketOptions.map((market) => (
                    <SelectItem key={market.id} value={market.symbol}>
                      {market.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="side">Side</Label>
              <Select value={side} onValueChange={(value) => setSide(value as 'buy' | 'sell')}>
                <SelectTrigger id="side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Order type</Label>
              <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="take_profit">Take profit</SelectItem>
                  <SelectItem value="stop_loss">Stop loss</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder={type === 'market' ? 'Market price' : 'Limit price'}
                disabled={type === 'market'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stopPrice">Trigger price</Label>
              <Input
                id="stopPrice"
                type="number"
                min="0"
                step="any"
                value={stopPrice}
                onChange={(event) => setStopPrice(event.target.value)}
                placeholder="Stop / trigger"
              />
            </div>
          </div>

                  <div className="flex justify-end">
                    <Button disabled={!formValid || isSubmitting} onClick={() => void handleSubmitOrder()}>
                      {isSubmitting ? 'Submitting…' : 'Place order'}
                    </Button>
                  </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your spot orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {bestOrders.length ? (
              <div className="space-y-3">
                {bestOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">{order.symbol}</p>
                      <p className="text-sm text-slate-500">{order.status}</p>
                    </div>
                    <p className="text-sm text-slate-400">
                      {order.side} {order.quantity} @ {order.type} {order.price ? order.price : 'market'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No spot orders found yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your positions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {positions.length ? (
              <div className="space-y-3">
                {positions.map((position) => (
                          <div key={`${position.symbol}-${position.id ?? position.symbol}`} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                            <p className="font-medium text-white">{position.symbol}</p>
                            <p className="text-sm text-slate-400">Size: {position.quantity} | Entry: {position.average_entry_price ?? 'n/a'} | PnL: {position.unrealized_pnl ?? 0}</p>
                          </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No open positions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Realtime trade feed</CardTitle>
        </CardHeader>
        <CardContent>
              {tradingRealtime.trades.length ? (
                <div className="space-y-3">
                  {tradingRealtime.trades.slice(0, 8).map((trade, index) => (
                    <div key={index} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3">
                      <p className="text-sm text-slate-200">{String(trade.symbol)} {String(trade.side).toUpperCase()} {String(trade.quantity)} @ {String(trade.price)}</p>
                      <p className="text-xs text-slate-500">{String(trade.type)} • {new Date(String(trade.created_at)).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Waiting for realtime trade events…</p>
              )}
        </CardContent>
      </Card>
    </div>
  );
}
