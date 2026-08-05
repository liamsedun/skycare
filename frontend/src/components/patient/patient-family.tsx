"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";

interface FamilyMember {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  dependant_relationship: string | null;
  is_primary_account: boolean;
  user_id: string | null;
}

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

function age(dob: string | null): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000));
  return years >= 0 ? `${years} yr` : null;
}

export default function PatientFamily() {
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/patients/me", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load family");
      setFamily(body.family ?? []);
      setRootId(body.rootId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load family");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addDependant(form: FormData) {
    if (!rootId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/dependants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryPatientId: rootId,
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          gender: (form.get("gender") as string) || undefined,
          dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
          phone: (form.get("phone") as string) || undefined,
          email: (form.get("email") as string) || undefined,
          relationship: form.get("relationship"),
          bloodGroup: (form.get("bloodGroup") as string) || undefined,
          genotype: (form.get("genotype") as string) || undefined,
          allergies: (form.get("allergies") as string) || undefined,
          portalEmail: (form.get("portalEmail") as string) || undefined,
          portalPassword: (form.get("portalPassword") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add family member");
      setShowAdd(false);
      setSuccess(`Added ${body.data?.first_name} ${body.data?.last_name} to your family.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add family member");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string, name: string) {
    if (!confirm(`Remove ${name} from your family? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/dependants/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove family member");
      setSuccess(`Removed ${name} from your family.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove family member");
    } finally {
      setBusy(false);
    }
  }

  const self = family.find((m) => m.is_primary_account);
  const dependants = family.filter((m) => !m.is_primary_account);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-foreground)]">Family</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
            Manage your family account{dependants.length > 0 ? ` — ${dependants.length} of 5 members added` : ""}.
          </p>
        </div>
        {rootId && dependants.length < 5 && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
          >
            <UserPlus size={16} aria-hidden="true" /> Add family member
          </button>
        )}
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

      {loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">Loading family…</p>
      ) : family.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <Users size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No family account yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {family.map((m) => (
            <div key={m.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--color-foreground)]">
                    {m.first_name} {m.last_name}
                  </p>
                  <p className="font-mono text-xs text-[var(--color-muted-fg)]">{m.patient_number}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase text-[var(--color-primary-dark)]">
                    {m.is_primary_account ? "Main account" : (m.dependant_relationship ?? "Family").replace(/_/g, " ")}
                  </span>
                  {!m.is_primary_account && !m.user_id && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.id, m.first_name)}
                      disabled={busy}
                      className="focus-ring rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-[var(--color-muted-fg)]">Gender</dt>
                  <dd className="capitalize text-[var(--color-foreground)]">{m.gender ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-muted-fg)]">Age</dt>
                  <dd className="text-[var(--color-foreground)]">{age(m.date_of_birth) ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-muted-fg)]">Phone</dt>
                  <dd className="text-[var(--color-foreground)]">
                    {m.phone ? <a className="focus-ring text-[var(--color-primary)] hover:underline" href={`tel:${m.phone}`}>{m.phone}</a> : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-muted-fg)]">Email</dt>
                  <dd className="truncate text-[var(--color-foreground)]">
                    {m.email ? <a className="focus-ring text-[var(--color-primary)] hover:underline" href={`mailto:${m.email}`}>{m.email}</a> : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {showAdd && rootId && (
        <AddMemberModal
          busy={busy}
          onClose={() => setShowAdd(false)}
          onAdd={addDependant}
        />
      )}
    </div>
  );
}

function AddMemberModal({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  onAdd: (form: FormData) => void;
}) {
  const [hasPortal, setHasPortal] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add family member"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold">Add family member</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(new FormData(e.currentTarget));
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="fam-first">First name</label>
              <input id="fam-first" name="firstName" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-last">Last name</label>
              <input id="fam-last" name="lastName" required className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="fam-rel">Relationship</label>
              <select id="fam-rel" name="relationship" required className={inputCls} defaultValue="">
                <option value="" disabled>Select…</option>
                <option value="spouse">Spouse</option>
                <option value="son">Son</option>
                <option value="daughter">Daughter</option>
                <option value="parent">Parent</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-gender">Gender</label>
              <select id="fam-gender" name="gender" className={inputCls} defaultValue="">
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="fam-dob">Date of birth</label>
              <input id="fam-dob" name="dateOfBirth" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-phone">Phone</label>
              <input id="fam-phone" name="phone" type="tel" className={inputCls} placeholder="+234…" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="fam-email">Email</label>
            <input id="fam-email" name="email" type="email" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="fam-blood">Blood group</label>
              <input id="fam-blood" name="bloodGroup" className={inputCls} placeholder="e.g. O+" />
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-geno">Genotype</label>
              <input id="fam-geno" name="genotype" className={inputCls} placeholder="e.g. AA" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="fam-allergies">Allergies</label>
            <input id="fam-allergies" name="allergies" className={inputCls} placeholder="e.g. penicillin" />
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={hasPortal}
                onChange={(e) => setHasPortal(e.target.checked)}
                className="focus-ring h-4 w-4 accent-[var(--color-primary)]"
              />
              Give them their own portal login
            </label>
            {hasPortal && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className={labelCls} htmlFor="fam-portal-email">Portal email</label>
                  <input id="fam-portal-email" name="portalEmail" type="email" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fam-portal-pass">Portal password</label>
                  <input id="fam-portal-pass" name="portalPassword" type="password" minLength={8} required className={inputCls} />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
              {busy ? "Saving…" : "Add member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
