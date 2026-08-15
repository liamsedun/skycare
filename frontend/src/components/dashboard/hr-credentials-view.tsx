"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import DateRangeBar from "@/components/filters/date-range-bar";
import { inDateRange } from "@/lib/daterange";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";

interface StaffOption {
  id: string;
  staff_number: string;
  users: { full_name: string; role: string } | null;
}

interface CredRow {
  id: string;
  staff_id: string;
  license_number: string;
  category: string;
  verified: boolean;
  issue_date: string | null;
  expiry_date: string | null;
  created_at: string;
  staff: { staff_number: string; profiles: { credentials_status: string | null }[]; users: { full_name: string; role: string } | null } | null;
}

const today = new Date().toISOString().slice(0, 10);

export default function HrCredentialsView() {
  const [rows, setRows] = useState<CredRow[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState({ staff_id: "", license_number: "", category: "", issue_date: "", expiry_date: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const me = await meRes.json();
      setIsAdmin(["hospital_admin", "hr_officer", "super_admin"].includes(me.data?.claims?.role));

      const [credsRes, staffRes] = await Promise.all([
        fetch("/api/hr/credentials?pageSize=200", { cache: "no-store" }),
        fetch("/api/hr/staff?pageSize=200", { cache: "no-store" }),
      ]);
      const creds = await credsRes.json();
      const staff = await staffRes.json();
      if (!credsRes.ok) throw new Error(creds.error ?? "Failed to load credentials");
      if (!staffRes.ok) throw new Error(staff.error ?? "Failed to load staff");
      setRows(creds.data ?? []);
      setStaffList(staff.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = rows.filter((c) => inDateRange(c.issue_date, from, to));

  async function addCred(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, issue_date: form.issue_date || null, expiry_date: form.expiry_date || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add credential");
      setShowAdd(false);
      setForm({ staff_id: "", license_number: "", category: "", issue_date: "", expiry_date: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add credential");
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/credentials/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified: true }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to verify");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this credential?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/credentials/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  function badge(c: CredRow) {
    const exp = c.expiry_date;
    const status = c.staff?.profiles?.[0]?.credentials_status;
    const cls =
      status === "expired" ? "bg-rose-100 text-rose-700" :
      status === "verified" ? "bg-emerald-100 text-emerald-700" :
      "bg-slate-100 text-slate-600";
    const label = status ?? (c.verified ? "verified" : "pending");
    return (
      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`} data-status={status}>
        <ShieldCheck className="h-3 w-3" /> {label}
        {exp && exp < today && <span className="text-[10px] font-semibold text-rose-500">EXPIRED</span>}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-[var(--color-primary)]" /> Staff credentials</div>
          <p className="text-sm text-[var(--color-muted-fg)]">Clinical staff need a verified, unexpired credential to be rostered on shifts.</p>
        </div>
        {isAdmin && (
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90" onClick={() => setShowAdd(true)}>
            Add credential
          </button>
        )}
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeBar
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setFrom(""); setTo(""); }}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-fg)]">
            <tr>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">License no.</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {visible.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{c.staff?.users?.full_name}</div>
                  <div className="text-xs text-[var(--color-muted-fg)]">{c.staff?.users?.role} · {c.staff?.staff_number}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{c.license_number}</td>
                <td className="px-4 py-3">{c.category}</td>
                <td className="px-4 py-3">{c.issue_date ?? "—"}</td>
                <td className="px-4 py-3">{c.expiry_date ?? "—"}</td>
                <td className="px-4 py-3">{badge(c)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {isAdmin && !c.verified && (
                      <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={() => verify(c.id)} disabled={busy}>
                        Verify
                      </button>
                    )}
                    {isAdmin && (
                      <button className="rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(c.id)} disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--color-muted-fg)]">No credentials recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={addCred}>
            <h3 className="mb-4 text-lg font-semibold">Add credential</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Staff</label>
                <select className={inputCls} value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} required>
                  <option value="">Select staff…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.users?.full_name} · {s.users?.role}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-sm font-medium">License number</label>
                  <input className={inputCls} value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} required /></div>
                <div><label className="mb-1 block text-sm font-medium">Category</label>
                  <input className={inputCls} placeholder="e.g. RN / MDCN" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-sm font-medium">Issue date</label>
                  <input type="date" className={inputCls} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div><label className="mb-1 block text-sm font-medium">Expiry date</label>
                  <input type="date" className={inputCls} value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Save credential
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
