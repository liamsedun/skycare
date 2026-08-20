"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { ROLE_LABELS, initials } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
import { mutedFg, errorBanner, cardTitle, mutedSm, flexGap2, mutedXsMt1, pageTitle, emptyState } from "@/lib/ui-constants";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)] disabled:bg-slate-50 disabled:text-[var(--color-muted-fg)]";
const labelCls = "mb-1 block text-sm font-medium text-[var(--color-foreground)]";

interface MeData {
  user: {
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    avatar_url: string | null;
    role: AppRole;
  } | null;
  tenant: { id: string; name: string } | null;
  staff: { staff_number: string | null; department: string | null; specialization: string | null } | null;
}

export default function ProfileView() {
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load profile");
      const d = body.data;
      setMe(d);
      setFullName(d.user?.full_name ?? "");
      setPhone(d.user?.phone ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone: phone || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save profile");
      setProfileMsg({ ok: true, text: "Profile updated." });
      await load();
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to save profile" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProfileMsg(null);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setProfileMsg({ ok: true, text: "Photo updated." });
      await load();
    } catch (err) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "New password and confirmation do not match" });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to change password");
      setPwMsg({ ok: true, text: "Password changed." });
      setCurPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to change password" });
    } finally {
      setSavingPw(false);
    }
  }

  if (loading) {
    return <p className={emptyState}>Loading profile…</p>;
  }
  if (!me?.user) {
    return (
      <p role="alert" className={errorBanner}>
        Could not load profile.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className={pageTitle}>My profile</h1>
        <p className={mutedSm}>Your account details and password.</p>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            {me.user.avatar_url && (
              <img
                src={me.user.avatar_url}
                alt=""
                className="h-20 w-20 rounded-full bg-slate-100 object-cover ring-2 ring-[var(--color-border)]"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
            {!me.user.avatar_url && (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)] text-2xl font-bold text-white">
                {initials(me.user.full_name)}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="focus-ring absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-md hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              aria-label="Upload photo"
              title="Upload photo"
            >
              {uploading ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Camera size={14} aria-hidden="true" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="truncate text-lg font-bold text-[var(--color-foreground)]">{me.user.full_name}</p>
            <p className="truncate text-sm text-[var(--color-muted-fg)]">{me.user.email}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-dark)]">
                <ShieldCheck size={12} aria-hidden="true" /> {ROLE_LABELS[me.user.role] ?? me.user.role}
              </span>
              {me.tenant && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{me.tenant.name}</span>
              )}
              {me.staff?.staff_number && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{me.staff.staff_number}</span>
              )}
            </div>
          </div>
        </div>

        {profileMsg && (
          <p role={profileMsg.ok ? "status" : "alert"} className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${profileMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]"}`}>
            {profileMsg.text}
          </p>
        )}

        <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="p-name">Full name</label>
            <input id="p-name" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls} htmlFor="p-email">Email</label>
            <input id="p-email" className={inputCls} value={me.user.email} disabled />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="p-phone">Phone</label>
            <input id="p-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              <Save size={16} aria-hidden="true" /> {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        <header className={flexGap2}>
          <KeyRound size={16} aria-hidden="true" className={mutedFg} />
          <h2 className={cardTitle}>Change password</h2>
        </header>

        {pwMsg && (
          <p role={pwMsg.ok ? "status" : "alert"} className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${pwMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-[var(--color-destructive-soft)] text-[var(--color-destructive)]"}`}>
            {pwMsg.text}
          </p>
        )}

        <form onSubmit={changePassword} className="mt-4 space-y-4">
          <div>
            <label className={labelCls} htmlFor="p-cur">Current password</label>
            <input id="p-cur" type="password" autoComplete="current-password" className={inputCls} value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="p-new">New password</label>
              <input id="p-new" type="password" autoComplete="new-password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
              <p className={mutedXsMt1}>At least 8 characters.</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="p-confirm">Confirm new password</label>
              <input id="p-confirm" type="password" autoComplete="new-password" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={8} />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPw}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
          >
            {savingPw ? "Changing…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}