import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfileRoute,
});

function ProfileRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name,phone,country,status,kyc_level')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    retry: false,
  });

  useEffect(() => {
    if (!user) return;
    const emailPrefix = user.email ? user.email.split('@')[0] : '';
    setDisplayName(String(profileQuery.data?.display_name ?? emailPrefix ?? ''));
    setPhone(profileQuery.data?.phone ?? '');
    setCountry(profileQuery.data?.country ?? '');
    setIsDirty(false);
  }, [profileQuery.data, user]);

  type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];

  const saveMutation = useMutation<ProfileInsert, Error, void>({
    mutationFn: async (): Promise<ProfileInsert> => {
      if (!user) throw new Error('User not authenticated');
      const payload: ProfileInsert = {
        id: user.id,
        email: user.email,
        display_name: displayName || null,
        phone: phone || null,
        country: country || null,
        status: (profileQuery.data?.status as ProfileInsert['status']) ?? ('active' as ProfileInsert['status']),
        kyc_level: (profileQuery.data?.kyc_level as ProfileInsert['kyc_level']) ?? ('none' as ProfileInsert['kyc_level']),
        trading_frozen: false,
        withdrawals_frozen: false,
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      return payload;
    },
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (error) => {
      toast.error(String(error));
    },
  });

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Manage your account profile details, contact information, and display preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Account status</Label>
              <Input id="status" value={profileQuery.data?.status ?? 'active'} disabled />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setIsDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kyc">KYC level</Label>
              <Input id="kyc" value={profileQuery.data?.kyc_level ?? 'none'} disabled />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              disabled={saveMutation.status === 'pending' || !isDirty}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.status === 'pending' ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
