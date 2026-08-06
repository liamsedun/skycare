"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  CreditCard,
  Dna,
  Droplets,
  Heart,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/ui/combobox";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface MeUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface PatientRow {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  marital_status: string;
  blood_group: string | null;
  genotype: string | null;
  medical_plan: string;
  address: string | null;
  city: string | null;
  state: string | null;
}

const selectOptions: Record<string, string[]> = {
  marital_status: ["single", "married", "divorced", "widowed"],
  blood_group: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  genotype: ["AA", "AS", "SS", "AC", "SC", "CC"],
  medical_plan: ["individual", "family", "organisation", "hmo"],
};

const selectLabels: Record<string, string> = {
  marital_status: "Marital Status",
  blood_group: "Blood Group",
  genotype: "Genotype",
  medical_plan: "Medical Plan",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Not provided";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function PatientProfile() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, patRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/patients/me", { cache: "no-store" }),
      ]);
      const me = await meRes.json();
      const pat = await patRes.json();
      if (!meRes.ok) throw new Error(me.error ?? "Failed to load profile");
      setUser(me.data?.user ?? null);
      if (patRes.ok && pat.data) {
        const family = pat.data.family ?? [];
        const own = family.find((f: { id: string }) => f.id === pat.data.selfId) ?? family[0];
        setPatient(own ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fullName = user?.full_name?.trim() || "Patient";
  const fullAddress = [patient?.address, patient?.city, patient?.state].filter(Boolean).join(", ");

  const infoRows: Array<{ label: string; value: string; icon: React.ElementType; field?: string }> = [
    { label: "Full Name", value: fullName, icon: User, field: "full_name" },
    { label: "Email", value: user?.email || "…", icon: Mail },
    { label: "Phone", value: user?.phone || "Not provided", icon: Phone, field: "phone" },
    { label: "Patient number", value: patient?.patient_number || "…", icon: CreditCard },
    { label: "Date of Birth", value: fmtDate(patient?.date_of_birth ?? null), icon: Calendar, field: "date_of_birth" },
    { label: "Marital Status", value: patient ? (patient.marital_status || "single").charAt(0).toUpperCase() + (patient.marital_status || "single").slice(1) : "…", icon: Heart, field: "marital_status" },
    { label: "Blood Group", value: patient?.blood_group || "Not provided", icon: Droplets, field: "blood_group" },
    { label: "Genotype", value: patient?.genotype || "Not provided", icon: Dna, field: "genotype" },
    { label: "Medical Plan", value: patient ? (patient.medical_plan || "individual").charAt(0).toUpperCase() + (patient.medical_plan || "individual").slice(1) : "…", icon: CreditCard, field: "medical_plan" },
    { label: "Address", value: fullAddress || "Not provided", icon: MapPin, field: "address" },
    { label: "Allergies", value: "Ask your doctor", icon: AlertTriangle },
  ];

  function startEdit(field: string, current: string) {
    setEditingField(field);
    setEditValue(current);
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  async function saveEdit() {
    if (!editingField) return;
    setError("");
    setSuccess("");
    const value = editValue.trim();
    if (!value) return;
    try {
      let res: Response;
      if (editingField === "full_name" || editingField === "phone") {
        res = await fetch("/api/auth/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [editingField === "full_name" ? "fullName" : "phone"]: value }),
        });
      } else if (editingField === "address") {
        res = await fetch("/api/patients/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: value }),
        });
      } else {
        res = await fetch("/api/patients/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [editingField]: value }),
        });
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update");
      setSuccess(`${selectLabels[editingField] ?? editingField} updated successfully`);
      setEditingField(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setSuccess("Photo updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (pwNew !== pwConfirm) {
      setPwError("Passwords do not match");
      return;
    }
    if (pwNew.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to change password");
      setPwSuccess("Password changed successfully");
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setTimeout(() => setPwOpen(false), 1200);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading profile…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">My profile</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">Manage your personal information.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary-soft)] text-lg font-bold text-[var(--color-primary-dark)]">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                initials(fullName)
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              className="focus-ring absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] disabled:opacity-60"
              aria-label="Upload photo"
              title="Upload photo"
            >
              {avatarBusy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : <Camera size={14} />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-foreground)]">{fullName}</p>
            <p className="text-sm text-[var(--color-muted-fg)]">
              {patient?.patient_number ? `${patient.patient_number} · ` : ""}
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Personal information</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {infoRows.map((row) => {
            const isEditing = editingField === row.field;
            const Icon = row.icon;
            const options = row.field ? selectOptions[row.field] : undefined;
            return (
              <div key={row.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--color-muted-fg)]">{row.label}</p>
                    {isEditing ? (
                      <div className="mt-1 flex items-center gap-2">
                        {options ? (
                          <Combobox
                            options={options}
                            defaultValue={editValue}
                            placeholder="Select or type"
                            onValueChange={setEditValue}
                            className="min-w-48"
                          />
                        ) : row.field === "date_of_birth" ? (
                          <input type="date" className={inputCls} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                        ) : (
                          <input type="text" className={inputCls} value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                        )}
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                          aria-label="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
                          aria-label="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{row.value}</p>
                    )}
                  </div>
                </div>
                {row.field && !isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(row.field!, row.field === "date_of_birth" ? (patient?.date_of_birth ?? "") : row.field === "full_name" ? (user?.full_name ?? "") : row.field === "phone" ? (user?.phone ?? "") : String((patient as any)?.[row.field!] ?? ""))}
                    className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted-fg)] hover:bg-slate-50"
                    aria-label={`Edit ${row.label}`}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">Account</h2>
        </div>
        <div className="flex flex-wrap gap-3 px-5 py-4">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50"
          >
            <Lock size={15} /> Change password
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-destructive-soft)] px-3.5 py-2 text-sm font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)] hover:text-white"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>

      {pwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Change password">
          <form onSubmit={handleChangePassword} className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-xl)]">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-foreground)]">Change password</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelCls} htmlFor="pw-current">Current password</label>
                <input id="pw-current" type="password" className={inputCls} value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="pw-new">New password</label>
                <input id="pw-new" type="password" className={inputCls} value={pwNew} onChange={(e) => setPwNew(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="pw-confirm">Confirm new password</label>
                <input id="pw-confirm" type="password" className={inputCls} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} required />
              </div>
              {pwError && (
                <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">
                  {pwError}
                </p>
              )}
              {pwSuccess && (
                <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  {pwSuccess}
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPwOpen(false);
                  setPwError("");
                  setPwSuccess("");
                }}
                className="focus-ring rounded-lg border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pwBusy}
                className="focus-ring rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pwBusy ? "Saving…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}