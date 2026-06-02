import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { AdminProtectedRoute } from '@/admin/guards/AdminProtectedRoute';
import { listWithdrawalDashboard, reviewWithdrawal } from '@/admin/withdrawals/service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/admin-withdrawals')({
  component: AdminWithdrawalReviewRoute,
});

function AdminWithdrawalReviewRoute() {
  const queryClient = useQueryClient();
  const withdrawalFn = useServerFn(listWithdrawalDashboard);
  const reviewFn = useServerFn(reviewWithdrawal);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'held'>('pending');

  const withdrawalsQuery = useQuery({
    queryKey: ['admin-withdrawals', statusFilter],
    queryFn: async () => await withdrawalFn({ data: { status: statusFilter, limit: 200, offset: 0 } }),
    retry: false,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ withdrawalId, decision, note }: { withdrawalId: string; decision: 'approved' | 'rejected' | 'hold'; note?: string }) => {
      await reviewFn({ data: { withdrawal_id: withdrawalId, decision, admin_note: note ?? null } });
    },
    onSuccess: () => {
      toast.success('Withdrawal reviewed');
      queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] });
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  useEffect(() => {
    const channel = supabase
      .channel('admin-withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-withdrawals', statusFilter] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, statusFilter]);

  const action = async (withdrawalId: string, decision: 'approved' | 'rejected' | 'hold') => {
    const note = window.prompt(`Add an optional admin note for ${decision} action:`) ?? undefined;
    await reviewMutation.mutateAsync({ withdrawalId, decision, note });
  };

  return (
    <AdminProtectedRoute activeSection="withdrawals">
      <div className="space-y-6 px-6 py-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Withdrawal approvals</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Review and approve or reject pending withdrawal requests before funds are released.
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
            <CardTitle>Withdrawals queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {withdrawalsQuery.data?.length ? (
              <div className="space-y-4">
                {withdrawalsQuery.data.map((withdrawal) => (
                  <div key={withdrawal.id} className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                          <span>{withdrawal.asset}</span>
                          <span>{withdrawal.network}</span>
                          <span>{withdrawal.display_status}</span>
                        </div>
                        <p className="mt-2 text-lg font-medium text-white">{withdrawal.amount}</p>
                        <p className="text-sm text-slate-500">{withdrawal.user_display_name ?? withdrawal.user_email ?? withdrawal.user_id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void action(withdrawal.id, 'approved')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void action(withdrawal.id, 'rejected')}>
                          Reject
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void action(withdrawal.id, 'hold')}>
                          Hold
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No withdrawal records found for this filter.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminProtectedRoute>
  );
}
