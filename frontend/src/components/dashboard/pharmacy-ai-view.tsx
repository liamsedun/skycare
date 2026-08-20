"use client";

import { cardTitle, divideBorder, mutedXsMt1, mutedSmPlain, rowStart } from "@/lib/ui-constants";
import { useCallback, useEffect, useState } from "react";
import {
  Brain, Zap, RefreshCw, AlertTriangle, PackageSearch, TrendingUp, Sparkles,
} from "lucide-react";

// ============================================================================
// Pharmacy AI — demand forecasts, anomaly detection and auto-reorder
// recommendations, powered by the on-database AI engine (0043-0047).
// ============================================================================

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const btnGhost =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-60";
const ngn = (v: number | null | undefined) => `₦${Number(v ?? 0).toLocaleString()}`;
const confStyle = (c?: string) =>
  c === "high" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
  : c === "medium" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
  : c === "low" ? "bg-red-50 text-red-700 ring-1 ring-red-200"
  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
const sevStyle = (s?: string) =>
  s === "critical" ? "bg-red-50 text-red-700 ring-1 ring-red-200"
  : s === "warning" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
  : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";

interface InsightsPayload {
  as_of?: string;
  last_forecast_at?: string | null;
  model_coverage?: { modelled?: number; high?: number; medium?: number; low?: number; insufficient?: number };
  stockout_risks?: Array<{ drug_id: string; name: string; on_hand: number; stockout_in_days: number; suggested_reorder: number; confidence: string }>;
  slow_movers?: Array<{ drug_id: string; name: string; on_hand: number; stockout_in_days: number }>;
  alerts_7d?: Record<string, number>;
  accuracy_30d?: number | null;
  demand_30d?: number | null;
  reorder_value?: number | null;
  ai_decisions_7d?: number | null;
}

interface ForecastRow {
  drugId: string;
  drugName: string | null;
  predictedQty: number;
  onHand: number;
  suggestedReorder: number;
  confidence: string;
  predictedAt: string;
}

interface RunResult {
  forecasts: ForecastRow[];
  anomalies: Array<{ anomalyType: string; severity: string; drugId: string | null; description: string }>;
  reorder: Array<{ supplierName: string; drugName: string; quantity: number; unitCost: number; lineTotal: number; poId: string | null; note: string }>;
}

interface ApiErr {
  error?: string;
}

function isApiErr(x: unknown): x is ApiErr & ApiErr {
  return !!x && typeof x === "object" && "error" in x;
}

export default function PharmacyAiView() {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/pharmacy/ai/insights", { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ApiErr;
      setToast({ kind: "err", msg: body.error ?? "Failed to load AI insights" });
      return;
    }
    const body = (await res.json()) as { data: { insights: InsightsPayload; forecasts: ForecastRow[] } };
    setInsights(body.data.insights ?? null);
    setForecasts(body.data.forecasts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSweep = useCallback(
    async (createPOs: boolean) => {
      setRunning(true);
      setToast(null);
      try {
        const res = await fetch("/api/pharmacy/ai/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: 7, createPurchaseOrders: createPOs }),
        });
        const body = (await res.json().catch(() => null)) as ApiErr | { data: RunResult } | null;
        if (!res.ok || !body || isApiErr(body)) {
          const msg = body && isApiErr(body) ? body.error ?? "AI sweep failed" : "AI sweep failed";
          setToast({ kind: "err", msg });
          return;
        }
        const d = (body as { data: RunResult }).data;
        setLastRun(d);
        setToast({
          kind: "ok",
          msg: createPOs
            ? `AI sweep complete — created ${d.reorder.length} reorder line(s) (${new Set(d.reorder.map((r) => r.poId ?? "")).size} draft PO)`
            : `AI sweep complete — ${d.forecasts.length} drug(s) forecast, ${d.anomalies.length} anomaly(ies) fired`,
        });
        await load();
      } finally {
        setRunning(false);
      }
    },
    [load]
  );

  const confChip = "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";
  const cov = insights?.model_coverage;
  const risks = insights?.stockout_risks ?? [];
  const alertsTotal = Object.values(insights?.alerts_7d ?? {}).reduce(
    (acc, c) => acc + (typeof c === "number" ? c : 0), 0
  ) || lastRun?.anomalies.length || 0;

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
            <Brain size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-[var(--color-foreground)]">AI insights</h2>
            <p className={mutedSmPlain}>
              Demand forecasting, anomaly detection and reorder automation.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} disabled={running} onClick={() => void runSweep(false)}>
            <RefreshCw size={14} aria-hidden="true" className={running ? "animate-spin" : ""} />
            {running ? "Running…" : "Run AI sweep"}
          </button>
          <button type="button" className={btnPrimary} disabled={running} onClick={() => void runSweep(true)}>
            <Sparkles size={14} aria-hidden="true" />
            Sweep + draft POs
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            toast.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {toast.msg}
        </div>
      )}

      {(insights || forecasts.length > 0) && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Forecast coverage" value={`${cov?.modelled ?? 0} drug(s)`} sub={`${cov?.high ?? 0} high · ${cov?.medium ?? 0} med · ${cov?.low ?? 0} low`} />
            <StatCard label="Stock-out risks" value={`${risks.length} drug(s)`} sub="within forecast horizon" warning={risks.length > 0} />
            <StatCard label="30-day demand" value={(insights?.demand_30d ?? 0).toLocaleString()}
              unit="units" sub={`accuracy ${insights?.accuracy_30d != null ? (insights.accuracy_30d * 100).toFixed(0) : "—"}%`} />
            <StatCard label="Reorder value" value={ngn(insights?.reorder_value ?? 0)} sub="current suggestion" />
            <StatCard label="AI decisions (7d)" value={`${insights?.ai_decisions_7d ?? 0}`} sub="logged, append-only" />
            <StatCard label="Alerts (7d)" value={`${alertsTotal}`} sub="across pharmacy" warning={alertsTotal > 0} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp size={15} className="text-violet-600" aria-hidden="true" />
                <h3 className={cardTitle}>Forecast vs on-hand</h3>
              </div>
              {forecasts.length === 0 ? (
                <EmptyState message="Run the AI sweep to generate forecasts" />
              ) : (
                <div className="space-y-2">
                  {forecasts.slice(0, 8).map((f) => (
                    <div
                      key={f.drugId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{f.drugName ?? "—"}</p>
                        <span className={confChip + " " + confStyle(f.confidence)}>{f.confidence ?? "n/a"}</span>
                      </div>
                      <div className="flex shrink-0 gap-4 text-right">
                        <StatCell label="Forecast 30d" value={String(f.predictedQty ?? 0)} />
                        <StatCell label="On hand" value={String(f.onHand ?? 0)} />
                        <StatCell label="Reorder" value={String(f.suggestedReorder ?? 0)} highlighted={(f.suggestedReorder ?? 0) > 0} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600" aria-hidden="true" />
                <h3 className={cardTitle}>Anomaly engine</h3>
              </div>
              {!lastRun || lastRun.anomalies.length === 0 ? (
                <EmptyState message="No anomalies fired in the last sweep" />
              ) : (
                <AnomalyList anomalies={lastRun.anomalies} />
              )}
            </div>
          </div>

          {lastRun && lastRun.reorder.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <PackageSearch size={15} className="text-emerald-600" aria-hidden="true" />
                <h3 className={cardTitle}>Reorder suggestions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className={rowStart}>
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted-fg)]">
                      <th className="pb-2 pr-4 font-semibold">Supplier</th>
                      <th className="pb-2 pr-4 font-semibold">Drug</th>
                      <th className="pb-2 pr-4 font-semibold">Qty</th>
                      <th className="pb-2 pr-4 font-semibold">Unit cost</th>
                      <th className="pb-2 pr-4 font-semibold">Line total</th>
                      <th className="pb-2 pr-4 font-semibold">PO</th>
                    </tr>
                  </thead>
                  <tbody className={divideBorder}>
                    {lastRun.reorder.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 text-[var(--color-foreground)]">{r.supplierName}</td>
                        <td className="py-2 pr-4 text-[var(--color-foreground)]">{r.drugName}</td>
                        <td className="py-2 pr-4 text-[var(--color-foreground)]">{r.quantity}</td>
                        <td className="py-2 pr-4 text-[var(--color-foreground)]">{ngn(r.unitCost)}</td>
                        <td className="py-2 pr-4 text-[var(--color-foreground)]">{ngn(r.lineTotal)}</td>
                        <td className="py-2 pr-4">
                          {r.poId ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                              draft PO
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">dry-run</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
                  Sourced from latest 30-day forecasts with the best supplier price + lead time. 
                  {lastRun.reorder.some((r) => !r.poId) ? "Dry-run mode only — no purchase orders were created." : ""}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {!insights && forecasts.length === 0 && !lastRun && !running && (
        <EmptyState message="No AI data yet — run the AI sweep to generate forecasts and anomalies" />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, unit, warning }: { label: string; value: string; sub?: string; unit?: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${warning ? "border-amber-200 bg-amber-50/60" : "border-[var(--color-border)] bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warning ? "text-amber-700" : "text-[var(--color-foreground)]"}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-[var(--color-muted-fg)]">{unit}</span>}
      </p>
      {sub && <p className={mutedXsMt1}>{sub}</p>}
    </div>
  );
}

function StatCell({ label, value, highlighted }: { label: string; value: string; highlighted?: boolean }) {
  return (
    <div className="min-w-[3.5rem]">
      <p className={`text-sm font-bold ${highlighted ? "text-emerald-700" : "text-[var(--color-foreground)]"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-6 text-sm text-[var(--color-muted-fg)]">
      <Sparkles size={14} aria-hidden="true" />
      {message}
    </div>
  );
}

function AnomalyList({ anomalies }: { anomalies: Array<{ anomalyType: string; severity: string; description: string }> }) {
  return (
    <div className="space-y-2">
      {anomalies.map((a, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5">
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevStyle(a.severity)}`}>
            {a.anomalyType}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-[var(--color-foreground)]">{a.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}