"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { BedDouble, Loader2, MapPin, RefreshCw, Satellite, Users } from "lucide-react";

const btnPrimary =
  "focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60";
const statusCls: Record<string, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  occupied: "border-rose-200 bg-rose-50 text-rose-700",
  maintenance: "border-amber-200 bg-amber-50 text-amber-700",
  cleaning: "border-sky-200 bg-sky-50 text-sky-700",
};

interface BedRow {
  id: string; bedNumber: string; status: string;
  occupant?: {
    patient_id: string; name: string; patientNumber: string; admissionId: string; admittedAt: string;
  } | null;
}

interface WardRow {
  id: string; name: string; ward_type: string | null; is_active: boolean;
  beds: BedRow[];
}

export default function BedMapView() {
  const [wards, setWards] = useState<WardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/bed-availability", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) { setToast(body.error ?? "Failed to load bed map"); setLoading(false); return; }
    setWards((body.data ?? []).filter((w: WardRow) => w.is_active));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const supabase = getSupabase();
    const channel = supabase
      .channel("bed-map-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beds" },
        (payload: unknown) => { void load(); }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnected(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnected(false);
      });
    unsubRef.current = () => { void supabase.removeChannel(channel); };
    return () => unsubRef.current?.();
  }, [load]);

  const totals = wards.reduce(
    (acc, w) => {
      for (const b of w.beds) {
        acc.total += 1;
        if (b.status === "occupied") acc.occupied += 1;
        else if (b.status === "available") acc.available += 1;
        else acc.other += 1;
      }
      return acc;
    },
    { total: 0, occupied: 0, available: 0, other: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
              <MapPin className="h-5 w-5 text-[var(--color-primary)]" /> Bed Map
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
              Live ward layout. Updates automatically when a bed changes status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              <Satellite size={12} /> {connected ? "LIVE" : "POLLING"}
            </span>
            <button onClick={() => void load()} className={btnPrimary} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-muted-fg)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available {totals.available}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Occupied {totals.occupied}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Maintenance / cleaning {totals.other}</span>
        </div>
        {toast && <p className="mt-3 text-xs text-rose-600">{toast}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-[var(--color-muted-fg)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : wards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted-fg)]">
          No active wards yet.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {wards.map((w) => (
            <div key={w.id} className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-foreground)]">
                    <BedDouble className="h-4 w-4 text-[var(--color-primary)]" /> {w.name}
                  </h3>
                  <p className="text-xs text-[var(--color-muted-fg)] capitalize">
                    {w.ward_type ?? "general"} ward · {w.beds.length} seats
                  </p>
                </div>
                <Users size={16} className="text-[var(--color-muted-fg)]" />
              </div>
              {w.beds.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--color-muted-fg)]">No beds in this ward.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {w.beds.map((b) => (
                    <div key={b.id} className={`rounded-xl border p-3 ${statusCls[b.status] ?? statusCls.available}`}>
                      <p className="text-xs font-bold">Bed {b.bedNumber}</p>
                      <p className="mt-0.5 text-[11px] capitalize">{b.status}</p>
                      {b.occupant && (
                        <p className="mt-1.5 text-[11px] font-semibold leading-tight">
                          {b.occupant.name}
                          <span className="block font-normal opacity-75">{b.occupant.patientNumber}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}