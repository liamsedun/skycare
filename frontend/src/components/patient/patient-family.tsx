"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Dna,
  Droplet,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { fileToSquareImage } from "@/lib/square-image";
import {
  AppCard,
  AppHeader,
  AppEmpty,
  AppSkeletonList,
  cn,
} from "@/components/patient/mobile/mobile-app-ui";
import {
  BLOOD_GROUPS,
  FamilyMember,
  GENOTYPES,
  MAX_DEPENDANTS,
  RELATIONSHIPS,
  ageOf,
  fmtDate,
  ngn,
  relInfo,
  statusOf,
} from "@/lib/patient-family-shared";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface InvoiceRow {
  id: string;
  patient_id: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
}

export default function PatientFamily() {
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [rootId, setRootId] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [outstandingBy, setOutstandingBy] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meRes, invRes] = await Promise.all([
        fetch("/api/patients/me", { cache: "no-store" }),
        fetch("/api/invoices?pageSize=200", { cache: "no-store" }),
      ]);
      const meBody = await meRes.json();
      if (!meRes.ok) throw new Error(meBody.error ?? "Failed to load family");
      const rows = meBody.data?.family as FamilyMember[] | undefined;
      const byId: Record<string, number> = {};
      if (invRes.ok) {
        const invBody = await invRes.json();
        const invoices = (invBody.data ?? []) as InvoiceRow[];
        for (const inv of invoices) {
          if (!inv.patient_id) continue;
          const status = inv.status ?? "";
          if (status === "pending" || status === "partially_paid") {
            byId[inv.patient_id] = (byId[inv.patient_id] ?? 0) + (Number(inv.total_amount) - Number(inv.paid_amount));
          }
        }
      }
      setFamily(rows ?? []);
      setRootId(meBody.data?.rootId ?? null);
      setSelfId(meBody.data?.selfId ?? null);
      setOutstandingBy(byId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load family");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const isMainAccount = selfId !== null && selfId === rootId;
  const root = family.find((m) => m.id === rootId) ?? family.find((m) => m.is_primary_account) ?? null;
  const familyCode = root?.patient_number ?? "—";
  const dependantCount = family.filter((m) => !m.is_primary_account).length;
  const slotsLeft = Math.max(0, MAX_DEPENDANTS - dependantCount);

  async function addDependant(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/dependants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error ?? "Failed to add family member");
      setShowAdd(false);
      setSuccess(`Added ${parsed.data?.first_name} ${parsed.data?.last_name} to your family.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add family member");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string, name: string) {
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

  const maxReached = isMainAccount && dependantCount >= MAX_DEPENDANTS;

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Dependants</h1>
              <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
                Manage family members under your care.
              </p>
            </div>
            {isMainAccount && !maxReached && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 px-4 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-lg transition-transform hover:scale-[1.02]"
              >
                <UserPlus size={16} aria-hidden="true" /> Add Dependant
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
          )}
          {success && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{success}</p>
          )}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl border border-[var(--color-border)] bg-white" />
              ))}
            </div>
          ) : (
            <>
              <FamilyAccountCard
                code={familyCode}
                used={dependantCount}
                total={MAX_DEPENDANTS}
                isMainAccount={isMainAccount}
              />

              {maxReached && (
                <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                  <AlertTriangle size={16} aria-hidden="true" />
                  You have reached the limit of {MAX_DEPENDANTS} dependants on this account.
                </p>
              )}

              {family.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
                  <Users size={40} aria-hidden="true" className="mx-auto text-[var(--color-muted-fg)]" />
                  <p className="mt-3 text-sm font-medium text-[var(--color-foreground)]">No family account yet.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {family.map((m) => (
                    <MemberCard key={m.id} member={m} outstanding={outstandingBy[m.id] ?? 0} />
                  ))}
                </div>
              )}

              {isMainAccount && slotsLeft > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] py-4 text-sm font-semibold text-[var(--color-muted-fg)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  <UserPlus size={16} aria-hidden="true" /> Add Dependant
                </button>
              )}

              <p className="flex items-start gap-2 text-xs text-[var(--color-muted-fg)]">
                <CalendarDays size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                Dependants share your family account — medical records, bills and appointments sync across all
                hospital systems.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile app view (LB parity, <md) ───────────────────────────── */}
      <div className="md:hidden">
        <div className="space-y-4">
          <Link
            href="/patient"
            className="focus-ring mb-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted-fg)] transition-colors hover:bg-black/5"
            aria-label="Back to overview"
          >
            <ChevronLeft size={20} />
          </Link>
          <AppHeader
            title="Dependants"
            meta="Manage family members under your care"
          />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{error}</p>
          )}
          {success && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{success}</p>
          )}

          {loading ? (
            <AppSkeletonList rows={4} />
          ) : (
            <>
              <FamilyAccountCard
                code={familyCode}
                used={dependantCount}
                total={MAX_DEPENDANTS}
                isMainAccount={isMainAccount}
                mobile
              />

              {maxReached && (
                <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600">
                  <AlertTriangle size={16} aria-hidden="true" />
                  You have reached the limit of {MAX_DEPENDANTS} dependants on this account.
                </p>
              )}

              {family.length === 0 ? (
                <AppEmpty
                  icon={Users}
                  title="No family members yet"
                  hint="Add a family member to get started"
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {family.map((m) => (
                    <MemberCard key={m.id} member={m} outstanding={outstandingBy[m.id] ?? 0} mobile />
                  ))}
                </div>
              )}

              {isMainAccount && slotsLeft > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e0a84a]/40 py-3.5 text-sm font-semibold text-[#e0a84a] transition-colors hover:border-[#e0a84a]"
                >
                  <UserPlus size={16} aria-hidden="true" /> Add Dependant
                </button>
              )}

              <p className="flex items-start gap-2 px-1 text-[11px] text-[var(--color-muted-fg)]">
                <CalendarDays size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                Dependants share your family account — medical records, bills and appointments sync across all
                hospital systems.
              </p>
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <AddMemberModal
          busy={busy}
          onClose={() => setShowAdd(false)}
          onAdd={addDependant}
        />
      )}
    </>
  );
}

function FamilyAccountCard({
  code,
  used,
  total,
  isMainAccount,
  mobile,
}: {
  code: string;
  used: number;
  total: number;
  isMainAccount: boolean;
  mobile?: boolean;
}) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  return (
    <AppCard className={cn("flex items-center gap-4", mobile ? "" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-md">
        <Users size={22} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">Family Account</p>
          <p className="font-mono text-sm font-bold text-[#e0a84a]">{code}</p>
          {!isMainAccount && (
            <span className="text-[11px] text-[var(--color-muted-fg)]">shared family</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">
          {used} of {total} slots used
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#e0a84a] to-amber-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </AppCard>
  );
}

function MemberCard({
  member,
  outstanding,
  mobile,
}: {
  member: FamilyMember;
  outstanding: number;
  mobile?: boolean;
}) {
  const rel = member.is_primary_account ? null : member.dependant_relationship;
  const info = relInfo(rel);
  const Icon = info.icon;
  const status = statusOf(member, outstanding);
  const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase();

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] shadow-md">
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.avatar_url} alt={member.first_name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-base font-bold text-[#e0a84a]">
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
              {member.first_name} {member.last_name}
            </p>
            {member.is_primary_account ? (
              <span className="shrink-0 rounded-full bg-[#e0a84a]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#e0a84a]">
                Main account
              </span>
            ) : status === "needs_attention" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <AlertTriangle size={10} aria-hidden="true" /> Needs attention
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <ShieldCheck size={10} aria-hidden="true" /> Active
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-muted-fg)]">
            <span className="font-semibold text-[#e0a84a]">{member.is_primary_account ? "FAM" : member.patient_number}</span>
            {member.is_primary_account ? "" : ` · ${member.patient_number}`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-muted-fg)]">
            <span>{ageOf(member.date_of_birth) ?? "—"} · {member.gender ? member.gender[0]?.toUpperCase() : "—"}</span>
            <span className="inline-flex items-center gap-1">
              <Droplet size={11} className="text-rose-500" /> {member.blood_group ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Dna size={11} className="text-cyan-500" /> {member.genotype ?? "—"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-muted-fg)]">
          <Icon size={13} className={info.grad.startsWith("from-") ? "text-[var(--color-primary)]" : undefined} />
          {member.is_primary_account ? "Primary holder" : info.label}
        </span>
        {outstanding > 0 ? (
          <span className="text-xs font-semibold text-rose-500">{ngn(outstanding)} outstanding</span>
        ) : (
          <span className="text-[11px] text-emerald-500">No outstanding bills</span>
        )}
      </div>
    </>
  );

  const cls = cn(
    "group block rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5",
    mobile
      ? "app-glass"
      : "border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
  );

  return (
    <Link href={`/patient/family/${member.id}`} className={cls}>
      {body}
      <span className="absolute right-14 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <ChevronRight size={18} className="text-[var(--color-muted-fg)]" />
      </span>
    </Link>
  );
}

function AddMemberModal({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  onAdd: (body: Record<string, unknown>) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [hasPortal, setHasPortal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setPhoto(await fileToSquareImage(file));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not read that image");
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add Dependant"
    >
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add Dependant</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onAdd({
              firstName: fd.get("firstName"),
              lastName: fd.get("lastName"),
              gender: fd.get("gender") === "Female" ? "female" : fd.get("gender") === "Male" ? "male" : "other",
              dateOfBirth: fd.get("dateOfBirth"),
              relationship: String(fd.get("relationship") ?? "other").toLowerCase(),
              bloodGroup: fd.get("bloodGroup"),
              genotype: fd.get("genotype"),
              allergies: fd.get("allergies"),
              phone: fd.get("phone"),
              email: fd.get("email"),
              portalEmail: hasPortal ? fd.get("portalEmail") : undefined,
              portalPassword: hasPortal ? fd.get("portalPassword") : undefined,
              avatar: photo ?? undefined,
            });
          }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Avatar preview" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-[#e0a84a]" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] text-[#e0a84a]">
                  <Camera size={26} aria-hidden="true" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="focus-ring absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#e0a84a] to-amber-500 text-[#0a0f1a] shadow-md disabled:opacity-60"
                aria-label="Upload photo"
              >
                {photoBusy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0a0f1a]/40 border-t-[#0a0f1a]" /> : <Camera size={13} />}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
            </div>
            <div className="min-w-0 flex-1 text-xs text-[var(--color-muted-fg)]">
              Add a photo so your family member is easy to recognise.
              <span className="mt-0.5 block text-[11px] text-amber-500">{photoError ?? "JPG or PNG — max 2 MB"}</span>
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="fam-name">Full name</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input id="fam-name" name="firstName" required placeholder="First name" className={inputCls} />
              <input name="lastName" required placeholder="Last name" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="fam-dob">Date of birth</label>
              <input id="fam-dob" name="dateOfBirth" type="date" required className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-sex">Sex</label>
              <select id="fam-sex" name="gender" required className={inputCls} defaultValue="">
                <option value="" disabled>Select…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="fam-blood">Blood group</label>
              <select id="fam-blood" name="bloodGroup" className={inputCls} defaultValue="">
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-geno">Genotype</label>
              <select id="fam-geno" name="genotype" className={inputCls} defaultValue="">
                <option value="">Select…</option>
                {GENOTYPES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="fam-rel">Relationship</label>
              <select id="fam-rel" name="relationship" required className={inputCls} defaultValue="">
                <option value="" disabled>Select…</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="fam-phone">Phone</label>
              <input id="fam-phone" name="phone" type="tel" className={inputCls} placeholder="+234…" />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="fam-email">Email</label>
            <input id="fam-email" name="email" type="email" className={inputCls} placeholder="for receipts and notifications" />
          </div>

          <div>
            <label className={labelCls} htmlFor="fam-allergies">Allergies</label>
            <textarea id="fam-allergies" name="allergies" rows={2} className={inputCls} placeholder="e.g. penicillin, latex — leave blank if none" />
          </div>

          <div className={cn("rounded-lg border border-[var(--color-border)] p-3", hasPortal && "border-[#e0a84a]/40 bg-[#e0a84a]/5")}>
            <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
              <input
                type="checkbox"
                checked={hasPortal}
                onChange={(e) => setHasPortal(e.target.checked)}
                className="focus-ring h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="font-medium">Give them their own portal login</span>
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
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "Adding…" : "Add Dependant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}