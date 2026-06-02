import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useFuturesRealtime } from '@/lib/futures-engine/client/hooks';
import { placeFuturesOrder, getUserFuturesOrders, getUserFuturesPositions } from '@/lib/futures-engine/functions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/futures')({
  component: FuturesRoute,
});

function FuturesRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const futuresRealtime = useFuturesRealtime();
  const placeOrder = useServerFn(placeFuturesOrder);
  const fetchOrders = useServerFn(getUserFuturesOrders);
  const fetchPositions = useServerFn(getUserFuturesPositions);

  const marketsQuery = useQuery({
    queryKey: ['futures-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id,symbol,base_asset,quote_asset,market_type')
        .eq('market_type', 'futures')
        .order('symbol');
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: ['user-futures-orders', user?.id],
    queryFn: async () => await fetchOrders(),
    enabled: !!user,
    retry: false,
  });

  const positionsQuery = useQuery({
    queryKey: ['user-futures-positions', user?.id],
    queryFn: async () => await fetchPositions(),
    enabled: !!user,
    retry: false,
  });

  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [type, setType] = useState<'market' | 'limit' | 'stop_market' | 'stop_limit' | 'take_profit' | 'stop_loss' | 'trailing_stop'>('market');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [leverage, setLeverage] = useState('1');
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');

  const marketOptions = marketsQuery.data ?? [];
  const placeMutation = useMutation(
    async () => {
      if (!symbol || !quantity) throw new Error('Symbol and quantity are required');
      const payload = {
        symbol,
        side,
        type,
        quantity: Number(quantity),
        price: type === 'market' ? null : Number(price),
        triggerPrice: triggerPrice ? Number(triggerPrice) : null,
        leverage: Number(leverage),
        marginMode,
      };
      await placeOrder(payload);
      return payload;
    },
    {
      onSuccess: () => {
        toast.success('Futures order placed');
        queryClient.invalidateQueries({ queryKey: ['user-futures-orders', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['user-futures-positions', user?.id] });
      },
      onError: (error) => toast.error(String(error)),
    },
  );

  const hasPriceField = type !== 'market';
  const isFormValid = Boolean(symbol && quantity && (!hasPriceField || price));

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Futures Trading</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Open leveraged futures positions and monitor your active derivatives exposure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New futures order</CardTitle>
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
              <Select value={side} onValueChange={(value) => setSide(value as 'long' | 'short')}>
                <SelectTrigger id="side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
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
                  <SelectItem value="stop_market">Stop market</SelectItem>
                  <SelectItem value="stop_limit">Stop limit</SelectItem>
                  <SelectItem value="take_profit">Take profit</SelectItem>
                  <SelectItem value="stop_loss">Stop loss</SelectItem>
                  <SelectItem value="trailing_stop">Trailing stop</SelectItem>
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
                placeholder="Position size"
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
                placeholder={hasPriceField ? 'Order price' : 'Market order'}
                disabled={!hasPriceField}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="triggerPrice">Trigger price</Label>
              <Input
                id="triggerPrice"
                type="number"
                min="0"
                step="any"
                value={triggerPrice}
                onChange={(event) => setTriggerPrice(event.target.value)}
                placeholder="Trigger price"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="leverage">Leverage</Label>
              <Input
                id="leverage"
                type="number"
                min="1"
                step="1"
                value={leverage}
                onChange={(event) => setLeverage(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="marginMode">Margin mode</Label>
              <Select value={marginMode} onValueChange={(value) => setMarginMode(value as 'isolated' | 'cross')}>
                <SelectTrigger id="marginMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="isolated">Isolated</SelectItem>
                  <SelectItem value="cross">Cross</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end">
              <Button disabled={!isFormValid || placeMutation.isLoading} onClick={() => placeMutation.mutate()}>
                {placeMutation.isLoading ? 'Placing…' : 'Place futures order'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Futures orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(ordersQuery.data ?? []).length ? (
              <div className="space-y-3">
                {ordersQuery.data?.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-white">{order.symbol}</p>
                      <p className="text-sm text-slate-500">{order.status}</p>
                    </div>
                    <p className="text-sm text-slate-400">
                      {order.side} {order.quantity} @ {order.type} {order.price ?? 'market'} | Leverage {order.leverage}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No futures orders yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open futures positions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(positionsQuery.data ?? []).length ? (
              <div className="space-y-3">
                {positionsQuery.data?.map((position) => (
                  <div key={position.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <p className="font-medium text-white">{position.symbol}</p>
                    <p className="text-sm text-slate-400">
                      {position.side} {position.quantity} | Entry {position.entry_price} | Unrealized PnL {position.unrealized_pnl ?? 0}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No open positions at the moment.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Realtime futures feed</CardTitle>
        </CardHeader>
        <CardContent>
          {futuresRealtime.futuresOrders.length ? (
            <div className="space-y-3">
              {futuresRealtime.futuresOrders.slice(0, 8).map((order) => (
                <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-3">
                  <p className="text-sm text-slate-200">{order.symbol} {order.side.toUpperCase()} {order.quantity} @ {order.price ?? 'market'}</p>
                  <p className="text-xs text-slate-500">{order.type} • {new Date(order.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Waiting for futures order updates…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
