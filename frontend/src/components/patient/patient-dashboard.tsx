"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FlaskConical,
  HeartPulse,
  IdCard,
  MoonStar,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  User as UserIcon,
  Users,
  Wallet,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ngn, initials } from "@/lib/auth";

interface FamilyMember {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  dependant_relationship: string | null;
  is_primary_account: boolean;
  status: string;
  medical_plan: string | null;
}

interface OrgProfile {
  name: string;
  logo_url: string | null;
  address: string | null;
  email: string | null;
}

interface Appointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  type: string;
  status: string;
  reason: string | null;
  patients: { first_name: string; last_name: string } | null;
  users: { full_name: string } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  patients: { first_name: string; last_name: string } | null;
}

interface LabOrder {
  id: string;
  status: string;
  requested_at: string;
  patients: { first_name: string; last_name: string } | null;
  lab_order_tests: Array<{
    test_name: string;
    lab_results: Array<{ result: string | null; is_abnormal: boolean }>;
  }>;
}

function statusClass(status: string): string {
  switch (status) {
    case "paid": case "completed": case "dispensed": return "bg-emerald-100 text-emerald-700";
    case "pending": case "requested": return "bg-amber-100 text-amber-700";
    case "partially_paid": case "sample_collected": case "in_progress": case "active": case "partially_dispensed":
      return "bg-sky-100 text-sky-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

const CARD =
  "rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]";

export default function PatientDashboard({
  fullName,
  avatarUrl,
}: {
  fullName: string;
  avatarUrl?: string | null;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [patientMe, setPatientMe] = useState<FamilyMember | null>(null);
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [apptRes, invRes, labRes, meRes, orgRes] = await Promise.all([
          fetch(`/api/appointments?from=${today}&pageSize=50`, { cache: "no-store" }),
          fetch("/api/invoices?pageSize=100", { cache: "no-store" }),
          fetch("/api/lab-orders?pageSize=50", { cache: "no-store" }),
          fetch("/api/patients/me", { cache: "no-store" }),
          fetch("/api/tenant/branding", { cache: "no-store" }),
        ]);
        const apptBody = await apptRes.json();
        const invBody = await invRes.json();
        const labBody = await labRes.json();
        const meBody = await meRes.json();
        const orgBody = await orgRes.json();
        if (apptRes.ok) setAppointments(apptBody.data ?? []);
        if (invRes.ok) setInvoices(invBody.data ?? []);
        if (labRes.ok) setLabOrders(labBody.data ?? []);
        if (meRes.ok) {
          const familyList = meBody.data?.family ?? [];
          setFamily(familyList);
          setPatientMe(
            familyList.find((m: FamilyMember) => m.is_primary_account) ??
              familyList[0] ??
              null
          );
        }
        if (orgRes.ok) setOrg(orgBody.data ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const first = useMemo(() => (fullName || "there").split(/\s+/)[0], [fullName]);

  const upcoming = useMemo(
    () => appointments.filter((a) => a.status !== "cancelled"),
    [appointments]
  );

  const { totalBilled, totalPaid, totalOutstanding } = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    for (const inv of invoices) {
      totalBilled += Number(inv.total_amount) || 0;
      totalPaid += Number(inv.paid_amount) || 0;
      if (["pending", "partially_paid"].includes(inv.status)) {
        totalOutstanding += (Number(inv.total_amount) - Number(inv.paid_amount)) || 0;
      }
    }
    return { totalBilled, totalPaid, totalOutstanding };
  }, [invoices]);

  const outstanding = useMemo(
    () =>
      invoices
        .filter((inv) => ["pending", "partially_paid"].includes(inv.status))
        .reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.paid_amount)), 0),
    [invoices]
  );

  const resultsReady = useMemo(
    () =>
      labOrders.filter(
        (order) => order.status === "completed" && order.lab_order_tests.some((t) => t.lab_results.length > 0)
      ).length,
    [labOrders]
  );

  const dependants = useMemo(() => family.filter((m) => !m.is_primary_account), [family]);

  const donutData = useMemo(() => {
    const paid = totalBilled - totalOutstanding;
    return [
      { name: "Paid", value: Math.max(paid, 0), color: "#10b981" },
      { name: "Outstanding", value: Math.max(totalOutstanding, 0), color: "#e0a84a" },
    ];
  }, [totalBilled, totalOutstanding]);

  const overdue = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return invoices.filter(
      (inv) =>
        ["pending", "partially_paid"].includes(inv.status) &&
        inv.due_date &&
        inv.due_date < todayIso
    );
  }, [invoices]);

  const greetingMap: Record<number, string> = {
    0: "Good evening",
    1: "Good evening",
    2: "Good evening",
    3: "Good evening",
    4: "Good evening",
    5: "Good morning",
    6: "Good morning",
    7: "Good morning",
    8: "Good morning",
    9: "Good morning",
    10: "Good morning",
    11: "Good morning",
    12: "Good afternoon",
    13: "Good afternoon",
    14: "Good afternoon",
    15: "Good afternoon",
    16: "Good afternoon",
    17: "Good evening",
    18: "Good evening",
    19: "Good evening",
    20: "Good evening",
    21: "Good evening",
    22: "Good evening",
    23: "Good evening",
  };
  const greeting = greetingMap[new Date().getHours()] ?? "Hello";
  const isNight = new Date().getHours() >= 17 || new Date().getHours() < 5;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-[var(--shadow-sm)]">
        <p className="py-10 text-center text-sm text-[var(--color-muted-fg)]">
          Loading your dashboard…
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)] bg-gradient-to-br from-[var(--color-primary)] via-[#d99a3f] to-[var(--color-primary-dark)] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-black/10 blur-xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/80">
              <Sparkles size={14} aria-hidden="true" /> Patient Overview
            </p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              {greeting}, {first}
              {isNight ? (
                <MoonStar className="inline-block text-white/90" size={26} aria-hidden="true" />
              ) : (
                <Sun className="inline-block text-white/90" size={26} aria-hidden="true" />
              )}
            </h1>
            <p className="mt-1 max-w-md text-sm text-white/85">
              Here&apos;s a quick look at your care — appointments, bills and results all in one place.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href="/patient/appointments"
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-background)] px-3.5 py-2 text-sm font-semibold text-[var(--color-foreground)] shadow-sm ring-1 ring-white/40 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
              </Link>
              <Link
                href="/patient/billing"
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Wallet size={16} aria-hidden="true" /> Pay a Bill
              </Link>
              <Link
                href="/patient/lab-results"
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition-transform duration-200 hover:-translate-y-0.5"
              >
                <FlaskConical size={16} aria-hidden="true" /> View Results
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-4 ring-1 ring-white/25 backdrop-blur">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-bold">
                  {initials(fullName)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">{fullName}</p>
              <p className="text-xs text-white/80">
                {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/patient/appointments"
          className={`${CARD} group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <CalendarClock size={19} aria-hidden="true" />
            </span>
            <ArrowRight size={15} className="text-[var(--color-muted-fg)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--color-foreground)]">{upcoming.length}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Upcoming appointments</p>
        </Link>
        <Link
          href="/patient/billing"
          className={`${CARD} group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <ReceiptText size={19} aria-hidden="true" />
            </span>
            <ArrowUpRight size={17} className="text-[var(--color-muted-fg)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-600">{ngn(outstanding)}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Outstanding balance</p>
        </Link>
        <Link
          href="/patient/lab-results"
          className={`${CARD} group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <FlaskConical size={19} aria-hidden="true" />
            </span>
            <ArrowRight size={17} className="text-[var(--color-muted-fg)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--color-foreground)]">{resultsReady}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-fg)]">Lab results ready</p>
        </Link>
      </div>

      {/* Charts + overview */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Donut: paid vs outstanding */}
        <section className={`${CARD} p-5 lg:col-span-1`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Your balance</h2>
            <Link href="/patient/billing" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
              View bills
            </Link>
          </div>
          <div className="relative mx-auto mt-3 h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => ngn(Number(value))}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid var(--color-border)",
                    fontSize: 13,
                    boxShadow: "0 10px 15px rgb(0 0 0 / 0.08)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-muted-fg)]">Outstanding</span>
              <span className="text-lg font-bold text-[var(--color-foreground)]">{ngn(outstanding)}</span>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-[var(--color-muted-fg)]">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" /> Paid
              </span>
              <span className="font-semibold text-[var(--color-foreground)]">{ngn(Math.max(totalBilled - totalOutstanding, 0))}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-[var(--color-muted-fg)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" /> Outstanding
              </span>
              <span className="font-semibold text-[var(--color-foreground)]">{ngn(outstanding)}</span>
            </div>
            {overdue.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-rose-600">
                  <ShieldCheck size={14} aria-hidden="true" /> Overdue
                </span>
                <span className="font-semibold text-rose-600">{overdue.length}</span>
              </div>
            )}
          </div>
        </section>

        {/* Upcoming appointments */}
        <section className={`${CARD} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Upcoming appointments</h2>
            <Link href="/patient/appointments" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
              Book / view all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Stethoscope size={34} className="text-[var(--color-muted)]" aria-hidden="true" />
              <p className="text-sm text-[var(--color-muted-fg)]">No upcoming appointments.</p>
              <Link
                href="/patient/appointments"
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <CalendarPlus size={14} aria-hidden="true" /> Book your next visit
              </Link>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {upcoming.slice(0, 4).map((a) => {
                const d = a.scheduled_date ? new Date(`${a.scheduled_date}T${a.start_time || "00:00"}`) : null;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-slate-50/60 px-4 py-3 transition-colors duration-200 hover:border-[var(--color-primary)]"
                  >
                    {d && !Number.isNaN(d.getTime()) ? (
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white text-center shadow-sm">
                        <span className="text-sm font-bold leading-none text-[var(--color-primary-dark)]">
                          {d.toLocaleDateString("en-NG", { day: "numeric" })}
                        </span>
                        <span className="mt-0.5 text-[10px] font-medium uppercase leading-none text-[var(--color-muted-fg)]">
                          {d.toLocaleDateString("en-NG", { month: "short" })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                        <CalendarClock size={20} aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                        {a.type.replace(/_/g, " ")}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted-fg)]">
                        {a.users?.full_name ? `Dr. ${a.users.full_name.split(/\s+/).slice(-2).join(" ")}` : "Doctor pending"}{" "}
                        {d ? `· ${new Date(`2000-01-01T${a.start_time || "00:00"}`).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusClass(a.status)}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Recent bills */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${CARD} p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Recent bills</h2>
            <Link href="/patient/billing" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
              View all
            </Link>
          </div>
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">No bills yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {invoices.slice(0, 4).map((inv) => {
                const total = Number(inv.total_amount) || 0;
                const paid = Number(inv.paid_amount) || 0;
                const pct = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
                return (
                  <li key={inv.id} className="rounded-xl border border-[var(--color-border)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-mono font-semibold text-[var(--color-foreground)]">
                          {inv.invoice_number}
                        </p>
                        <p className="truncate text-xs text-[var(--color-muted-fg)]">
                          {inv.patients ? `${inv.patients.first_name} ${inv.patients.last_name}` : ""}{" "}
                          {inv.due_date ? `· due ${new Date(inv.due_date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-[var(--color-foreground)]">{ngn(total)}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(inv.status)}`}>
                          {inv.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${inv.status === "paid" ? "bg-emerald-500" : "bg-[var(--color-primary)]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-[var(--color-muted-fg)]">
                        {pct.toFixed(0)}% paid
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Health snapshot */}
        <section className={`${CARD} p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Care snapshot</h2>
            <Link href="/patient/records" className="focus-ring text-xs font-medium text-[var(--color-primary)] hover:underline">
              My records
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            <li className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-sky-700">
                <CalendarClock size={16} aria-hidden="true" /> Upcoming appointments
              </span>
              <span className="text-sm font-bold text-[var(--color-foreground)]">{upcoming.length}</span>
            </li>
            <li className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-amber-700">
                <ReceiptText size={16} aria-hidden="true" /> Overdue bills
              </span>
              <span className="text-sm font-bold text-[var(--color-foreground)]">{overdue.length}</span>
            </li>
            <li className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-emerald-700">
                <FlaskConical size={16} aria-hidden="true" /> Lab results ready
              </span>
              <span className="text-sm font-bold text-[var(--color-foreground)]">{resultsReady}</span>
            </li>
          </ul>
        </section>
      </div>
        </div>
      </div>

      {/* ── Mobile app view (Life Blossom parity, <md) ─────────────────── */}
      <div className="md:hidden">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-muted-fg)]">
                Patient Overview
              </p>
              <h1 className="mt-0.5 flex items-center gap-1.5 truncate text-xl font-bold text-[var(--color-foreground)]">
                {greeting}, {first}
                {isNight ? (
                  <MoonStar className="inline-block shrink-0 text-amber-500" size={20} aria-hidden="true" />
                ) : (
                  <Sun className="inline-block shrink-0 text-amber-500" size={20} aria-hidden="true" />
                )}
              </h1>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-slate-100 px-3 py-1.5 text-xs font-medium text-[var(--color-muted-fg)]">
              {new Date().toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>

          {/* Summary 2-col cards */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/patient/appointments"
              className="app-glass group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 text-amber-600">
                <CalendarClock size={20} aria-hidden="true" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">Upcoming</p>
              <p className="mt-0.5 text-sm font-bold text-[var(--color-foreground)]">
                {loading ? "…" : upcoming.length === 1 ? "1 appointment" : `${upcoming.length} appointments`}
              </p>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted-fg)]">
                {upcoming[0] ? new Date(`${upcoming[0].scheduled_date}T${upcoming[0].start_time || "00:00"}`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Book a visit"}
              </p>
            </Link>
            <Link
              href="/patient/billing"
              className="app-glass group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 text-rose-600">
                <CreditCard size={20} aria-hidden="true" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">Outstanding</p>
              <p className="mt-0.5 truncate text-sm font-bold text-[var(--color-foreground)]">{loading ? "…" : ngn(outstanding)}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted-fg)]">
                {loading ? "" : `${invoices.filter((i) => ["pending", "partially_paid"].includes(i.status)).length} pending bill(s)`}
              </p>
            </Link>
            <Link
              href="/patient/family"
              className="app-glass group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 text-sky-600">
                <Users size={20} aria-hidden="true" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">Family</p>
              <p className="mt-0.5 text-sm font-bold text-[var(--color-foreground)]">
                {loading ? "…" : `${dependants.length} dependant${dependants.length === 1 ? "" : "s"}`}
              </p>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted-fg)]">Manage family members under your care</p>
            </Link>
            <Link
              href="/patient/lab-results"
              className="app-glass group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 text-emerald-600">
                <FlaskConical size={20} aria-hidden="true" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">Results Ready</p>
              <p className="mt-0.5 text-sm font-bold text-[var(--color-foreground)]">{loading ? "…" : resultsReady}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted-fg)]">Lab tests with results</p>
            </Link>
          </div>

          {/* Quick actions */}
          <div className="app-glass relative overflow-hidden rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Quick Actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Book", href: "/patient/appointments", g: "from-[#e0a84a] to-amber-500" },
                { label: "Pay", href: "/patient/billing", g: "from-emerald-500 to-teal-400" },
                { label: "Prescription", href: "/patient/prescriptions", g: "from-cyan-500 to-sky-400" },
                { label: "Chat", href: "/patient/chats", g: "from-blue-500 to-indigo-400" },
                { label: "Records", href: "/patient/records", g: "from-violet-500 to-purple-400" },
                { label: "Bills", href: "/patient/billing", g: "from-orange-500 to-amber-400" },
                { label: "Results", href: "/patient/lab-results", g: "from-rose-500 to-pink-400" },
              ].map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r px-4 text-sm font-medium text-white shadow-lg transition-all hover:scale-105 active:scale-[0.98] ${a.g}`}
                >
                  {a.label}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>

          {/* Family chips */}
          {dependants.length > 0 && (
            <div className="app-glass relative overflow-hidden rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <Link href="/patient/family" className="flex items-center gap-0.5 text-sm font-semibold text-[var(--color-foreground)] hover:underline">
                  Family <ChevronRight size={14} className="text-[#e0a84a]" aria-hidden="true" />
                </Link>
                <Link href="/patient/family" className="flex items-center gap-0.5 text-xs text-[#e0a84a] hover:underline">
                  Manage <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {dependants.map((d) => (
                  <Link
                    key={d.id}
                    href="/patient/family"
                    className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-slate-100 pr-3 pl-2 transition-all hover:border-[#e0a84a]/40"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#e0a84a]/25 bg-[#e0a84a]/15 text-[10px] font-bold text-[#e0a84a]">
                      {d.first_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-xs font-medium whitespace-nowrap text-[var(--color-foreground)]">{d.first_name}</span>
                    {d.status === "inactive" && <AlertTriangle size={12} className="text-amber-500" aria-hidden="true" />}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Identity card */}
          <div className="app-glass relative overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2 px-4 pt-4">
              <IdCard size={16} className="text-[#e0a84a]" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Identity Card</h3>
            </div>
            <div className="m-3 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b2a4a] via-[#0e3a63] to-[#0d5f7a]">
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-md">
                  {org?.logo_url ? (
                    <img src={org.logo_url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-[#0a0f1a]">SC</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{org?.name ?? "SkyCare"}</p>
                  {org?.address && <p className="truncate text-[10px] text-white/60">{org.address}</p>}
                  {org?.email && <p className="truncate text-[10px] text-white/60">{org.email}</p>}
                </div>
              </div>
              <div className="flex gap-3 px-4 pt-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] ring-1 ring-[#e0a84a]/30">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-[#e0a84a]">{initials(fullName)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-white">{fullName}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#e0a84a]">
                    Patient No: {patientMe?.patient_number ?? "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#e0a84a]/25 bg-[#e0a84a]/15 px-2 py-0.5 text-[10px] font-semibold text-[#e0a84a] capitalize">
                      <HeartPulse size={12} aria-hidden="true" />
                      {patientMe?.medical_plan ?? "individual"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium capitalize text-white/70">
                      <UserIcon size={12} aria-hidden="true" />
                      {patientMe?.gender ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="px-4 pt-3 pb-1">
                <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-1.5">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-[10px] font-semibold tracking-wider text-white/45 uppercase">Phone</span>
                    <span className="truncate text-right text-xs font-semibold text-white">{patientMe?.phone ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-[10px] font-semibold tracking-wider text-white/45 uppercase">Date of Birth</span>
                    <span className="truncate text-right text-xs font-semibold text-white">
                      {patientMe?.date_of_birth
                        ? new Date(patientMe.date_of_birth).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 bg-[#e0a84a] px-4 py-2.5">
                <p className="text-center text-[11px] leading-snug font-semibold text-[#0a0f1a]">
                  Your Health, Our Priority — Where Care Meets Cure.
                </p>
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="app-glass relative overflow-hidden rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Recent Activity</h3>
              <ChevronRight size={16} className="text-[var(--color-muted-fg)]" aria-hidden="true" />
            </div>
            {loading ? (
              <p className="text-xs text-[var(--color-muted-fg)]">Loading…</p>
            ) : (
              <div className="space-y-3">
                {upcoming.length > 0 && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 text-blue-600">
                      <CalendarClock size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-foreground)]">Upcoming appointment</p>
                      <p className="truncate text-xs text-[var(--color-muted-fg)]">
                        {new Date(`${upcoming[0].scheduled_date}T${upcoming[0].start_time || "00:00"}`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        {" · "}
                        {upcoming[0].type.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                )}
                {resultsReady > 0 && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 text-emerald-600">
                      <CheckCircle2 size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-foreground)]">Lab results ready</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">{resultsReady} completed test(s) with results</p>
                    </div>
                  </div>
                )}
                {invoices.filter((i) => ["pending", "partially_paid"].includes(i.status)).length > 0 && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e0a84a]/10 text-[#e0a84a]">
                      <ReceiptText size={16} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-foreground)]">Outstanding bills</p>
                      <p className="text-xs text-[var(--color-muted-fg)]">{ngn(outstanding)} pending</p>
                    </div>
                  </div>
                )}
                {upcoming.length === 0 && resultsReady === 0 && invoices.length === 0 && (
                  <p className="text-xs text-[var(--color-muted-fg)]">No recent activity yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}