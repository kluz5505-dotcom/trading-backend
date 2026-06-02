import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { AdminProtectedRoute } from '@/admin/guards/AdminProtectedRoute';
import { listDepositDashboard, reviewDeposit } from '@/admin/deposits/service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/admin-deposits')({
  component: AdminDepositReviewRoute,
});

function AdminDepositReviewRoute() {
  const queryClient = useQueryClient();
  const depositFn = useServerFn(listDepositDashboard);
  const reviewFn = useServerFn(reviewDeposit);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'held'>('pending');

  const depositsQuery = useQuery({
    queryKey: ['admin-deposits', statusFilter],
    queryFn: async () => await depositFn({ data: { status: statusFilter, limit: 200, offset: 0 } }),
    retry: false,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ depositId, decision, note }: { depositId: string; decision: 'approved' | 'rejected' | 'hold'; note?: string }) => {
      await reviewFn({ data: { deposit_id: depositId, decision, admin_note: note ?? null } });
    },
    onSuccess: () => {
      toast.success('Deposit reviewed');
      queryClient.invalidateQueries({ queryKey: ['admin-deposits'] });
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  useEffect(() => {
    const channel = supabase
      .channel('admin-deposits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-deposits', statusFilter] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, statusFilter]);

  const action = async (depositId: string, decision: 'approved' | 'rejected' | 'hold') => {
    const note = window.prompt(`Add an optional admin note for ${decision} action:`) ?? undefined;
    await reviewMutation.mutateAsync({ depositId, decision, note });
  };

  return (
    <AdminProtectedRoute activeSection="deposits">
      <div className="space-y-6 px-6 py-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Deposit approvals</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Review and approve or reject pending deposits submitted by users.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(['pending', 'approved', 'rejected', 'held'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'secondary' : 'ghost'}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deposits queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {depositsQuery.data?.length ? (
              <div className="space-y-4">
                {depositsQuery.data.map((deposit) => (
                  <div key={deposit.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                          <span>{deposit.asset}</span>
                          <span>{deposit.network}</span>
                          <span>{deposit.display_status}</span>
                        </div>
                        <p className="mt-2 text-lg font-medium text-white">{deposit.amount}</p>
                        <p className="text-sm text-slate-500">{deposit.user_display_name ?? deposit.user_email ?? deposit.user_id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void action(deposit.id, 'approved')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void action(deposit.id, 'rejected')}>
                          Reject
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void action(deposit.id, 'hold')}>
                          Hold
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No deposit records found for this filter.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminProtectedRoute>
  );
}
