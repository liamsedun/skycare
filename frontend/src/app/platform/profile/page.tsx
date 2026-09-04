"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera, Save, Lock, RefreshCw, LogOut, Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { PlatformGlassCard, PlatformPageHeader } from "@/components/platform/platform-mobile-ui";

interface Profile {
  id: string; email: string; fullName: string; role: string;
  isActive: boolean; avatarUrl: string | null; preferences: Record<string, unknown>;
  lastLogin: string | null; createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameEdit, setNameEdit] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", new: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/profile", { credentials: "include" });
      const d = await res.json();
      setProfile(d.data);
      setNameEdit(d.data?.fullName || "");
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveName() {
    setSavingName(true);
    try {
      await fetch("/api/platform/profile", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: nameEdit }),
      });
      setProfile((p) => p ? { ...p, fullName: nameEdit } : p);
      setEditingName(false);
    } catch (e) { console.error(e); }
    setSavingName(false);
  }

  async function changePassword() {
    if (pw.new !== pw.confirm) { setPwMsg("Passwords don't match"); return; }
    setSavingPw(true); setPwMsg("");
    try {
      const res = await fetch("/api/platform/profile/password", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.new }),
      });
      const d = await res.json();
      if (res.ok) { setPwMsg("Password updated!"); setPw({ current: "", new: "", confirm: "" }); }
      else { setPwMsg(d.error || "Failed to update password"); }
    } catch (e) { setPwMsg("Failed to update password"); }
    setSavingPw(false);
  }

  function fmtDate(s: string | null) {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.push("/platform/login");
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadMsg("Image must be 2 MB or smaller");
      return;
    }
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/uploads/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const d = await res.json();
      if (res.ok && d.data?.avatar_url) {
        setProfile((p) => p ? { ...p, avatarUrl: d.data.avatar_url } : p);
        setUploadMsg("Photo updated!");
      } else {
        setUploadMsg(d.error || "Upload failed");
      }
    } catch {
      setUploadMsg("Upload failed");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (!profile) return <div className="py-20 text-center text-[var(--color-muted-fg)]">Failed to load profile</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 platform-stagger">
      <PlatformPageHeader title="My Profile" subtitle="">
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button onClick={signOut} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 platform-btn-gradient">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </PlatformPageHeader>

      {/* Profile card */}
      <PlatformGlassCard className="p-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700 overflow-hidden">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.fullName?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              title="Upload photo (max 2 MB)"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
          </div>
          <div className="flex-1">
            {uploadMsg && (
              <p className={`mb-2 text-xs ${uploadMsg.includes("updated") ? "text-emerald-600" : "text-red-600"}`}>{uploadMsg}</p>
            )}
            {editingName ? (
              <div className="flex items-center gap-2">
                <input value={nameEdit} onChange={(e) => setNameEdit(e.target.value)}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm" />
                <button onClick={saveName} disabled={savingName} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                  {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </button>
                <button onClick={() => { setEditingName(false); setNameEdit(profile.fullName); }} className="text-xs text-[var(--color-muted-fg)] hover:underline">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--color-foreground)]">{profile.fullName}</h2>
                <button onClick={() => setEditingName(true)} className="text-xs text-blue-600 hover:underline">Edit</button>
              </div>
            )}
            <p className="text-sm text-[var(--color-muted-fg)]"><a href={`mailto:${profile.email}`} className="hover:underline">{profile.email}</a></p>
            <span className="mt-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">{profile.role}</span>
          </div>
        </div>
      </PlatformGlassCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Change password */}
        <PlatformGlassCard className="p-6">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
            <Lock className="h-4 w-4" /> Change Password
          </h3>
          <div className="space-y-3">
            <input type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            <input type="password" placeholder="New password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            <input type="password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm" />
            {pwMsg && <p className={`text-xs ${pwMsg.includes("updated") ? "text-emerald-600" : "text-red-600"}`}>{pwMsg}</p>}
            <button onClick={changePassword} disabled={savingPw || !pw.current || !pw.new || !pw.confirm}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 platform-btn-gradient">
              {savingPw ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Update Password"}
            </button>
          </div>
        </PlatformGlassCard>

        {/* Account info */}
        <PlatformGlassCard className="p-6">
          <h3 className="mb-4 font-semibold text-[var(--color-foreground)]">Account Info</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Account ID</span><span className="font-mono text-xs">{profile.id.slice(0, 8)}…</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Email</span><a href={`mailto:${profile.email}`} className="hover:underline">{profile.email}</a></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Role</span><span className="capitalize">{profile.role.replace(/_/g, " ")}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Last Login</span><span>{fmtDate(profile.lastLogin)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted-fg)]">Member Since</span><span>{fmtDate(profile.createdAt)}</span></div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted-fg)]">Status</span>
              <span className={profile.isActive ? "text-emerald-600" : "text-red-600"}>{profile.isActive ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </PlatformGlassCard>
      </div>
    </div>
  );
}
