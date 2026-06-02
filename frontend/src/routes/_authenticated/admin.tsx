import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AdminProtectedRoute } from "@/admin/guards/AdminProtectedRoute";
import { platformAnalytics } from "@/lib/admin-extra.functions";
import { getMonitoringTelemetry, getSecurityTelemetry } from "@/lib/monitoring-engine/functions";
import { getTreasuryTelemetry } from "@/lib/treasury-engine/functions";
import { getExchangeValidationTelemetry, runExchangeValidation } from "@/lib/validation.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminBackendRoute,
});

function AdminBackendRoute() {
  const fetchAnalytics = useServerFn(platformAnalytics);
  const fetchMonitoring = useServerFn(getMonitoringTelemetry);
  const fetchSecurity = useServerFn(getSecurityTelemetry);
  const fetchTreasury = useServerFn(getTreasuryTelemetry);
  const fetchValidation = useServerFn(getExchangeValidationTelemetry);
  const runValidation = useServerFn(runExchangeValidation);

  const analyticsQuery = useQuery({
    queryKey: ["admin-platform-analytics"],
    queryFn: async () => await fetchAnalytics(),
    staleTime: 10000,
  });

  const monitoringQuery = useQuery({
    queryKey: ["admin-monitoring-telemetry"],
    queryFn: async () => await fetchMonitoring(),
    staleTime: 10000,
  });

  const securityQuery = useQuery({
    queryKey: ["admin-security-telemetry"],
    queryFn: async () => await fetchSecurity(),
    staleTime: 10000,
  });

  const treasuryQuery = useQuery({
    queryKey: ["admin-treasury-telemetry"],
    queryFn: async () => await fetchTreasury(),
    staleTime: 10000,
  });

  const validationQuery = useQuery({
    queryKey: ["admin-exchange-validation"],
    queryFn: async () => await fetchValidation(),
    staleTime: 30000,
  });

  const runValidationMutation = useMutation({
    mutationFn: async () => await runValidation(),
    onSuccess: () => {
      validationQuery.refetch();
    },
  });

  const analytics = analyticsQuery.data;
  const monitoring = monitoringQuery.data;
  const security = securityQuery.data;
  const treasury = treasuryQuery.data;
  const validation = validationQuery.data;

  return (
    <AdminProtectedRoute
      activeSection="dashboard"
      title="Exchange Admin Core"
      subtitle="Backend governance for live exchange operations"
      role="super_admin"
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">
                Admin backend control center
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Live operational telemetry</h2>
              <p className="mt-1 text-sm text-slate-400">
                Admin and operational layers are now backed by live treasury, monitoring, and security telemetry.
              </p>
            </div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
              {monitoring?.health?.healthy ? "HEALTHY" : "ATTENTION"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total users" value={analytics?.users_total ?? 0} detail="registered profiles" />
            <SummaryCard label="Treasury reserve" value={treasury ? Number(treasury.summary.total_reserve ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"} detail="hot + cold custody" />
            <SummaryCard label="Open incidents" value={monitoring?.health?.open_incidents ?? 0} detail="current operational incidents" />
            <SummaryCard label="Security alerts" value={security?.securityEvents?.length ?? 0} detail="recent security events" />
            <SummaryCard label="Validation status" value={validation?.overall_status ?? "unknown"} detail="live exchange validation health" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">Validation & readiness</div>
              <h3 className="mt-1 text-lg font-semibold text-white">Exchange validation suite</h3>
              <p className="mt-1 text-sm text-slate-400">
                Automated health checks span balances, spot PnL, futures liquidation readiness, monitoring coverage, and security telemetry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => runValidationMutation.mutate()}
              disabled={runValidationMutation.isPending}
              className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runValidationMutation.isPending ? "Running..." : "Run validation"}
            </button>
          </div>

          {validationQuery.isPending ? (
            <p className="mt-4 text-sm text-slate-400">Loading validation snapshot...</p>
          ) : validationQuery.error ? (
            <p className="mt-4 text-sm text-red-400">{validationQuery.error.message}</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <MetricBox label="Overall status" value={validation?.overall_status ?? "unknown"} />
                <MetricBox label="Pass checks" value={validation?.passing ?? 0} />
                <MetricBox label="Warnings" value={validation?.warnings ?? 0} />
                <MetricBox label="Failures" value={validation?.failing ?? 0} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">Runtime summary</div>
                    <div className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-200">{validation?.runtime_ms ?? 0} ms</div>
                  </div>
                  <div className="space-y-2 text-sm text-slate-300">
                    {Object.entries(validation?.metrics ?? {}).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
                        <span className="text-slate-300">{key.replace(/_/g, " ")}</span>
                        <span className="font-medium text-white">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">Validation checks</div>
                  <div className="space-y-2">
                    {(validation?.checks ?? []).map((check: Record<string, unknown>) => (
                      <div key={String(check.name)} className="rounded-lg border border-slate-800 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-white">{String(check.name)}</div>
                            <div className="text-xs text-slate-400">{String(check.message)}</div>
                          </div>
                          <div className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${
                            String(check.status) === "fail"
                              ? "bg-red-500/10 text-red-300"
                              : String(check.status) === "warning"
                                ? "bg-amber-500/10 text-amber-200"
                                : "bg-emerald-500/10 text-emerald-200"
                          }`}>
                            {String(check.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">Treasury & risk</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Treasury telemetry</h3>
              </div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Realtime snapshot</div>
            </div>

            {treasuryQuery.isPending ? (
              <p className="mt-4 text-sm text-slate-400">Loading treasury telemetry...</p>
            ) : treasuryQuery.error ? (
              <p className="mt-4 text-sm text-red-400">{treasuryQuery.error.message}</p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <MetricBox label="Available balance" value={Number(treasury.summary.available_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                  <MetricBox label="Reserved balance" value={Number(treasury.summary.reserved_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                  <MetricBox label="Liabilities" value={Number(treasury.summary.liabilities ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                  <MetricBox label="Net treasury" value={Number(treasury.summary.net_treasury ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">Reserve alerts</div>
                  {treasury.reserveAlerts.length === 0 ? (
                    <p className="text-sm text-slate-400">No reserve alerts at the moment.</p>
                  ) : (
                    <div className="space-y-2">
                      {treasury.reserveAlerts.slice(0, 6).map((entry: Record<string, unknown>) => (
                        <div key={String(entry.id)} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm">
                          <div>
                            <div className="font-medium text-white">{String(entry.label ?? entry.asset ?? "wallet")}</div>
                            <div className="text-xs text-slate-400">{String(entry.asset ?? "asset")}</div>
                          </div>
                          <div className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">{String(entry.status ?? "warning")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">Operations</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Monitoring & security</h3>
              </div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Live feed</div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricBox label="Monitoring events" value={monitoring?.health?.monitoring_events_last_hour ?? 0} />
              <MetricBox label="Warning events" value={monitoring?.health?.warning_events_last_hour ?? 0} />
              <MetricBox label="Fraud flags" value={security?.fraudFlags?.length ?? 0} />
              <MetricBox label="Pending KYC" value={analytics?.kyc_pending ?? 0} />
            </div>

            <div className="mt-4 space-y-2">
              {monitoring?.incidents?.slice(0, 6).map((incident: Record<string, unknown>) => (
                <div key={String(incident.id)} className="rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{String(incident.title ?? incident.service ?? "Incident")}</div>
                      <div className="text-xs text-slate-400">{String(incident.service ?? "service")}</div>
                    </div>
                    <div className="rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-red-300">{String(incident.status ?? "open")}</div>
                  </div>
                </div>
              )) ?? <p className="text-sm text-slate-400">No active incidents.</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">Security</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Recent security events</h3>
              </div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Event stream</div>
            </div>
            <div className="mt-4 space-y-2">
              {securityQuery.isPending ? (
                <p className="text-sm text-slate-400">Loading security events...</p>
              ) : security?.securityEvents?.slice(0, 8).map((event: Record<string, unknown>) => (
                <div key={String(event.id)} className="rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{String(event.event_type ?? event.title ?? "Security event")}</div>
                      <div className="text-xs text-slate-400">{String(event.message ?? "No message")}</div>
                    </div>
                    <div className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-200">{String(event.severity ?? "info")}</div>
                  </div>
                </div>
              )) ?? <p className="text-sm text-slate-400">No security events recorded.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-200/70">Activity</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Platform monitoring feed</h3>
              </div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Recent events</div>
            </div>
            <div className="mt-4 space-y-2">
              {monitoringQuery.isPending ? (
                <p className="text-sm text-slate-400">Loading monitoring feed...</p>
              ) : monitoring?.events?.slice(0, 8).map((event: Record<string, unknown>) => (
                <div key={String(event.id)} className="rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{String(event.service ?? "service")}</div>
                      <div className="text-xs text-slate-400">{String(event.message ?? event.event_type ?? "monitoring event")}</div>
                    </div>
                    <div className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200">{String(event.status ?? "ok")}</div>
                  </div>
                </div>
              )) ?? <p className="text-sm text-slate-400">No monitoring telemetry yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </AdminProtectedRoute>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-200/70">Control module</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm font-medium text-white">{label}</div>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </article>
  );
}

function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-200/70">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
