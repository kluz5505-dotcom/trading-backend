import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/wallets')({
  component: WalletsRoute,
});

type AssetRow = { symbol: string; name?: string | null; networks?: Database['public']['Enums']['network_type'][] | null };
type WalletAddressRow = { id: string; user_id: string; asset: string; network: Database['public']['Enums']['network_type']; address: string; memo?: string | null };

function WalletsRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [asset, setAsset] = useState('');
  const [network, setNetwork] = useState<Database['public']['Enums']['network_type'] | ''>('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');

  const assetsQuery = useQuery<AssetRow[]>({
    queryKey: ['wallet-assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('symbol,name,networks')
        .order('symbol');
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
    retry: false,
  });

  const walletQuery = useQuery<WalletAddressRow[]>({
    queryKey: ['wallet-addresses', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('wallet_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('asset');
      if (error) throw error;
      return (data ?? []) as WalletAddressRow[];
    },
    enabled: !!user,
    retry: false,
  });

  useEffect(() => {
    const currentAsset = asset || assetsQuery.data?.[0]?.symbol;
    setAsset(currentAsset ?? '');
  }, [assetsQuery.data]);

  function isNetworkArray(value: unknown): value is Database['public']['Enums']['network_type'][] {
    return (
      Array.isArray(value) &&
      value.every((item): item is Database['public']['Enums']['network_type'] =>
        typeof item === 'string' &&
        Constants.public.Enums.network_type.some((candidate) => candidate === item),
      )
    );
  }

  const assetNetworks = useMemo(() => {
    const selected = assetsQuery.data?.find((row) => row.symbol === asset);
    return isNetworkArray(selected?.networks) ? selected.networks : [];
  }, [assetsQuery.data, asset]);

  useEffect(() => {
    if (assetNetworks.length > 0 && (!isNetworkType(network) || !assetNetworks.includes(network))) {
      setNetwork(assetNetworks[0]);
    }
  }, [assetNetworks, network]);

  function isNetworkType(v: unknown): v is Database['public']['Enums']['network_type'] {
    return typeof v === 'string' && Constants.public.Enums.network_type.some((candidate) => candidate === v);
  }

  const saveMutation = useMutation<boolean, Error, void>({
    
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      if (!asset || !network || !address) throw new Error('Asset, network and address are required');

      if (!isNetworkType(network)) throw new Error('Invalid network type');

      const { error } = await supabase
        .from('wallet_addresses')
        .upsert(
          {
            user_id: user.id,
            asset,
            network,
            address,
            memo: memo || null,
          },
          {
            onConflict: 'user_id,asset,network',
          },
        );
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      toast.success('Wallet address saved');
      queryClient.invalidateQueries({ queryKey: ['wallet-addresses', user?.id] });
    },
    onError: (error) => toast.error(String(error)),
  });

  const deleteMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wallet_addresses').delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      toast.success('Payload removed');
      queryClient.invalidateQueries({ queryKey: ['wallet-addresses', user?.id] });
    },
    onError: (error) => toast.error(String(error)),
  });

  useEffect(() => {
    if (!user) return undefined;
    const channel = supabase
      .channel(`user-wallets-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_addresses', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['wallet-addresses', user.id] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Wallets</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Manage the blockchain wallet addresses tied to your account for deposits and withdrawals.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add or update a wallet address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <Select value={asset} onValueChange={(value) => setAsset(value)}>
                <SelectTrigger id="asset">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {assetsQuery.data?.map((row) => (
                    <SelectItem key={row.symbol} value={row.symbol}>
                      {row.symbol} {row.name ? `(${row.name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="network">Network</Label>
              <Select value={network} onValueChange={(value) => { if (isNetworkType(value)) setNetwork(value); else setNetwork(''); }}>
                <SelectTrigger id="network">
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {assetNetworks.map((networkOption) => (
                    <SelectItem key={networkOption} value={networkOption}>
                      {networkOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Wallet address"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memo">Memo / tag</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Optional memo"
              />
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.status === 'pending' || !asset || !network || !address}>
                {saveMutation.status === 'pending' ? 'Saving…' : 'Save wallet'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved wallet addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {walletQuery.data?.length ? (
            <div className="space-y-4">
              {walletQuery.data.map((wallet) => (
                <div key={wallet.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">{wallet.asset} / {wallet.network}</p>
                      <p className="font-medium text-white break-all">{wallet.address}</p>
                      {wallet.memo ? <p className="text-sm text-slate-500">Memo: {wallet.memo}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => {
                        setAsset(wallet.asset);
                        setNetwork(wallet.network);
                        setAddress(wallet.address);
                        setMemo(wallet.memo ?? '');
                      }}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(wallet.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No wallet addresses saved yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
