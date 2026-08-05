import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Boxes,
  CalendarCheck,
  Check,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Globe,
  HeartPulse,
  LineChart,
  MapPin,
  MessageSquareText,
  MonitorSmartphone,
  Phone,
  Pill,
  Rocket,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import { MobileNav } from "@/components/landing/mobile-nav";
import { Gallery } from "@/components/landing/gallery";
import { TeamShowcase } from "@/components/landing/team-showcase";
import { LiveChat } from "@/components/landing/live-chat";
import { SkyCareLogo, SkyCareMark } from "@/components/landing/skycare-logo";
import {
  FacebookIcon,
  InstagramIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/landing/social-icons";

const features = [
  {
    icon: HeartPulse,
    title: "Patient Management",
    desc: "Lifetime electronic health records — registration to discharge to follow-up. NHIA, insurance and next-of-kin data on one screen.",
  },
  {
    icon: CalendarCheck,
    title: "Appointments & Reminders",
    desc: "Smart scheduling with automated SMS & email reminders that cut no-shows. Reschedule links built in.",
  },
  {
    icon: CreditCard,
    title: "Billing & Revenue",
    desc: "Automated invoicing, multi-payment support, insurance claim processing and revenue-leakage alerts — no naira slips through.",
  },
  {
    icon: Pill,
    title: "Pharmacy Management",
    desc: "Real-time inventory, batch & expiry tracking, reorder alerts, NAFDAC compliance reports and e-prescribing with drug-interaction warnings.",
  },
  {
    icon: FlaskConical,
    title: "Laboratory & Diagnostics",
    desc: "Order labs and radiology from the consultation screen. Results post back automatically, flagged when abnormal.",
  },
  {
    icon: BedDouble,
    title: "Ward & Bed Management",
    desc: "Live bed-occupancy map, admission & transfer workflows, ward-round documentation and discharge summaries.",
  },
  {
    icon: Users,
    title: "Staff & HR",
    desc: "Roster & shift planner, attendance, leave, and role-based access. Booking respects who is actually on duty.",
  },
  {
    icon: Boxes,
    title: "Supply Chain & Stores",
    desc: "Purchase orders, GRN, supplier management, store requisitions and asset tracking — end to end.",
  },
  {
    icon: LineChart,
    title: "Reports & Analytics",
    desc: "Executive dashboards, NHIA-ready regulatory reports, department performance and a custom report builder.",
  },
];

const modules = [
  "Electronic Health Records (EHR)",
  "Outpatient & Inpatient registration",
  "Visit history & pre-appointment notes",
  "Unique patient ID · NHIA · Insurance",
  "Multi-branch hospital support",
  "Doctor availability calendar",
  "Drug interaction warnings",
  "PharmacyPro dispensing link",
  "Automated SMS & email reminders",
  "Revenue forecasting & fraud alerts",
  "Cloud access from any device",
  "Hospital website + patient app included",
];

const pricing = [
  {
    name: "Basic",
    ngn: "7,000",
    usd: "5",
    per: "month",
    desc: "For single clinics getting digital.",
    features: [
      "1 clinic / branch",
      "Patient records (EHR)",
      "Appointments & scheduling",
      "Billing & payments",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    name: "Pro",
    ngn: "13,000",
    usd: "9",
    per: "month",
    desc: "The full hospital operating system.",
    features: [
      "All Basic features",
      "Pharmacy & drug inventory",
      "Laboratory & diagnostics",
      "Ward & bed management",
      "SMS appointment reminders",
      "Reports & analytics",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    ngn: "80,000",
    usd: "53",
    per: "month",
    desc: "For hospital chains & groups.",
    features: [
      "Multi-branch hospitals",
      "NHIA / insurance integration",
      "Custom workflows",
      "Dedicated account manager",
      "On-premise option",
      "AI features",
    ],
    cta: "Talk to Sales",
    highlight: false,
  },
  {
    name: "Custom",
    ngn: "Tailored",
    usd: "Custom",
    per: "project",
    desc: "Government & large institutions.",
    features: [
      "Full customization",
      "On-premise / private cloud",
      "National-scale deployments",
      "Training & migration",
      "24/7 dedicated support",
    ],
    cta: "Request Proposal",
    highlight: false,
  },
];

const steps = [
  {
    icon: MonitorSmartphone,
    title: "Sign up in 2 minutes",
    desc: "Create your hospital workspace, add your branch, and invite your first staff member. No credit card required.",
  },
  {
    icon: Users,
    title: "Add patients & staff",
    desc: "Register patients with NHIA/insurance details, set up doctors' calendars, and configure your departments.",
  },
  {
    icon: Rocket,
    title: "Go live the same day",
    desc: "Start booking appointments, billing, and dispensing. Your hospital website and patient app are generated automatically.",
  },
];

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#modules", label: "Modules" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#gallery", label: "Gallery" },
  { href: "#pricing", label: "Pricing" },
  { href: "#hospital-website", label: "Hospital Website" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <SkyCareLogo size={36} />
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-sky-600">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-700 transition-colors hover:text-sky-600"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="btn-shine rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40"
            >
              Start Free Trial
            </Link>
          </div>
          <div className="sm:hidden">
            <MobileNav />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white">
        <div className="landing-grid-bg absolute inset-0" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 animate-pulse-glow rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 animate-float-y-slow rounded-full bg-sky-300/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 top-1/3 h-40 w-40 animate-float-y rounded-full bg-blue-300/20 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:pt-24">
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25 backdrop-blur">
            <SkyCareMark size={18} rounded="rounded-md" /> Built by Skyhouse Technologies · Nigeria
          </span>
          <h1 className="font-heading animate-fade-up mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl" style={{ animationDelay: "80ms" }}>
            Run Your Hospital Smarter — <span className="text-sky-200">From Anywhere</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg text-sky-50/90" style={{ animationDelay: "160ms" }}>
            SkyCare is the all-in-one hospital management OS for Nigeria and Africa —
            EHR, billing, pharmacy, lab, wards, HR and analytics. Every hospital also
            gets a free website and a patient app.
          </p>
          <div className="mt-8 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "240ms" }}>
            <Link
              href="/signup"
              className="btn-shine group flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-base font-bold text-white shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/40"
            >
              Start Free Trial{" "}
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="#pricing"
              className="rounded-full border border-white/60 bg-white/15 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:bg-white/25"
            >
              See Pricing
            </Link>
          </div>

          {/* hero trust bar */}
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-center gap-6 border-t border-white/15 pt-6 text-sm sm:flex-row sm:gap-10">
            {[
              { label: "120+ hospitals digitized", value: "₦2.4B+ billed yearly" },
              { label: "5-min setup", value: "99.9% uptime" },
              { label: "NHIA-ready", value: "24/7 support" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-0.5">
                <span className="font-bold text-white">{s.value}</span>
                <span className="text-sky-100/80">{s.label}</span>
              </div>
            ))}
          </div>

          {/* dashboard preview */}
          <div className="relative mx-auto mt-12 max-w-4xl">
            <div className="pointer-events-none absolute -inset-x-4 -top-4 bottom-0 rounded-3xl bg-sky-900/20 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white text-left shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-xs text-slate-400 ring-1 ring-slate-200">
                  app.skycare.app
                </span>
              </div>
              <div className="grid gap-0 sm:grid-cols-[200px_1fr]">
                <aside className="hidden border-r border-slate-100 bg-slate-50/60 p-4 sm:block">
                  {[
                    { icon: Activity, t: "Overview", active: true },
                    { icon: HeartPulse, t: "Patients" },
                    { icon: CalendarCheck, t: "Appointments" },
                    { icon: CreditCard, t: "Billing" },
                    { icon: Pill, t: "Pharmacy" },
                  ].map((m) => (
                    <div
                      key={m.t}
                      className={`mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                        m.active
                          ? "bg-sky-600 font-semibold text-white"
                          : "text-slate-500"
                      }`}
                    >
                      <m.icon size={15} />
                      {m.t}
                    </div>
                  ))}
                </aside>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Patients", value: "12,480", delta: "+12%" },
                      { label: "Today's appointments", value: "38", delta: "+8" },
                      { label: "Revenue (July)", value: "₦18.4M", delta: "+21%" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-100 p-3">
                        <p className="text-[11px] text-slate-400">{s.label}</p>
                        <p className="font-heading mt-1 text-sm font-bold text-slate-800 sm:text-lg">
                          {s.value}
                        </p>
                        <p className="text-[11px] font-medium text-emerald-600">{s.delta}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 hidden items-end gap-1.5 sm:flex">
                    {[45, 62, 40, 78, 55, 90, 68, 84].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-sky-100" style={{ height: `${h * 0.6}px` }}>
                        <div className="rounded-t-md bg-sky-500" style={{ height: `${h * 0.45}px` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[
                      { t: "Dr. Okafor · General checkup", time: "09:00" },
                      { t: "Dr. Adeyemi · Antenatal", time: "10:30" },
                      { t: "Dr. Musa · Hypertension review", time: "11:45" },
                    ].map((a) => (
                      <div key={a.time} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">{a.t}</span>
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700">{a.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* real team photos */}
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
            {[
              {
                src: "/images/landing-page-images-skyblue-backgr/team-male-female-african-american-medical-staff-discussing-diagnostic-results.jpg",
                alt: "Care team discussing a patient's diagnostic results together",
                caption: "Your care team, in sync",
              },
              {
                src: "/images/landing-page-images-skyblue-backgr/black-professional-team-people-explaining-x-ray.jpg",
                alt: "Hospital team explaining an X-ray to a patient",
                caption: "Diagnostics, explained",
              },
            ].map((p, i) => (
              <figure
                key={p.src}
                className={`group relative overflow-hidden rounded-2xl border-2 border-white/30 shadow-2xl shadow-sky-950/40 transition-transform duration-300 hover:-translate-y-1.5 ${
                  i === 1 ? "sm:translate-y-4" : ""
                }`}
              >
                <div className="relative aspect-[16/10]">
                  <Image
                    src={p.src}
                    alt={p.alt}
                    fill
                    sizes="(min-width: 640px) 480px, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur">
                  {p.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* SCREENSHOT MARQUEE */}
      <div className="marquee-mask overflow-hidden border-b border-slate-100 bg-white py-10">
        <div className="animate-marquee flex w-max gap-6">
          {[1, 2].map((half) => (
            <div key={half} className="flex gap-6" aria-hidden={half === 2}>
              {[
                ...Array.from({ length: 6 }, (_, i) => `/images/hospital-website/hosp-website-${String(i + 1).padStart(2, "0")}.png`),
                ...Array.from({ length: 6 }, (_, i) => `/images/staff-web-images/staff-web-${String(i + 1).padStart(2, "0")}.png`),
              ].map((src, i) => (
                <div
                  key={`${half}-${i}`}
                  className="relative w-56 shrink-0 overflow-hidden rounded-xl border border-slate-200 shadow-md"
                >
                  <div className="relative aspect-video bg-slate-100">
                    <Image
                      src={src}
                      alt="SkyCare app screenshot"
                      fill
                      sizes="224px"
                      className="object-cover object-top"
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              <Sparkles size={13} /> EVERYTHING IN ONE SYSTEM
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Everything your hospital runs on, <span className="text-gradient">in one system</span>
            </h2>
            <p className="mt-3 text-slate-600">
              Nine deep modules replace your papers, spreadsheets and separate apps —
              with one patient record at the center of it all.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-xl"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors duration-200 group-hover:bg-sky-600 group-hover:text-white">
                  <f.icon size={22} />
                </span>
                <h3 className="font-heading mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              <Check size={13} /> BUILT FOR AFRICA
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Purpose-built for <span className="text-gradient">Nigerian & African healthcare</span>
            </h2>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m}
                className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition-shadow hover:shadow-md"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={14} />
                </span>
                <span className="text-sm font-medium text-slate-700">{m}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM SHOWCASE */}
      <TeamShowcase />

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              <Activity size={13} /> QUICK TO START
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              From sign-up to go-live <span className="text-gradient">in one day</span>
            </h2>
          </div>
          <div className="relative mt-12 grid gap-8 md:grid-cols-3">
            <div className="pointer-events-none absolute left-1/2 top-8 hidden h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-sky-200 to-transparent md:block" />
            {steps.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl sky-gradient text-white shadow-lg">
                  <s.icon size={26} />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-sky-600 shadow ring-1 ring-sky-100">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-heading mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOSPITAL WEBSITE */}
      <section id="hospital-website" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              <Globe size={13} /> INCLUDED IN EVERY PLAN
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Every hospital gets a <span className="text-gradient">website + patient app</span>
            </h2>
            <p className="mt-4 text-slate-600">
              When you sign up, SkyCare generates your hospital&apos;s public website
              at <span className="font-mono text-sky-600">yourhospital.skycare.app</span> —
              with your branding, services, contact and online booking — plus a
              white-labelled PWA your patients install on any phone to book, pay,
              chat with their doctor and see lab results.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Auto-generated website: Home, About, Services, Contact, Book Appointment",
                "Custom domain support: use yourhospital.com",
                "Patient PWA: bookings, history, payments, chat, lab results",
                "Brand colors, logo and name applied automatically",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={12} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-center gap-2 rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="rounded-b-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg sky-gradient text-white">
                  <HeartPulse size={18} />
                </span>
                <div>
                  <p className="font-bold">democare.skycare.app</p>
                  <p className="text-xs text-slate-500">demo hospital website</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  { icon: CalendarCheck, t: "Book an appointment", d: "Online booking form" },
                  { icon: Stethoscope, t: "Meet our doctors", d: "Profiles & specialties" },
                  { icon: Activity, t: "Services & departments", d: "What we treat" },
                  { icon: MessageSquareText, t: "Contact & directions", d: "Phone, WhatsApp, map" },
                ].map((r) => (
                  <div
                    key={r.t}
                    className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-sky-50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                      <r.icon size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{r.t}</p>
                      <p className="text-xs text-slate-500">{r.d}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-100">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
                    <ClipboardList size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Patient App</p>
                    <p className="text-xs text-slate-500">Installable PWA · iOS, Android, desktop</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <Gallery />

      {/* PRICING */}
      <section id="pricing" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              <CreditCard size={13} /> SIMPLE PRICING
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Simple pricing, <span className="text-gradient">built for Nigerian budgets</span>
            </h2>
            <p className="mt-3 text-slate-600">
              Every plan includes the hospital website and patient app. Prices in NGN; USD shown at current rates.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {pricing.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 transition-all duration-200 hover:-translate-y-1 ${
                  p.highlight
                    ? "border-sky-500 shadow-2xl ring-2 ring-sky-500/30"
                    : "border-slate-200 shadow-sm hover:shadow-xl"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full sky-gradient px-3 py-1 text-xs font-bold text-white shadow-md">
                    MOST POPULAR
                  </span>
                )}
                <h3 className="font-heading text-lg font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
                <div className="mt-4">
                  <span className="font-heading text-3xl font-extrabold">₦{p.ngn}</span>
                  <span className="text-sm text-slate-500"> /{p.per}</span>
                </div>
                <p className="text-xs text-slate-400">≈ ${p.usd} USD</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check size={10} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-all ${
                    p.highlight
                      ? "sky-gradient text-white shadow-md hover:-translate-y-px hover:opacity-90"
                      : "border border-slate-300 text-slate-700 hover:border-sky-400 hover:text-sky-600"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-slate-500">
            Government & large hospitals →{" "}
            <a href="#cta" className="font-semibold text-sky-600 hover:underline">
              request a custom proposal
            </a>
          </p>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              <MessageSquareText size={13} /> LOVED BY HEALTHCARE TEAMS
            </span>
            <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Trusted by hospitals <span className="text-gradient">across Africa</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                q: "We stopped losing invoices and patients. Revenue visibility alone paid for the subscription in the first month.",
                n: "Dr. Amina B.",
                r: "Medical Director, Lagos clinic",
                initials: "AB",
              },
              {
                q: "The pharmacy module ended our stockouts. Expiry alerts and reorder levels run themselves now.",
                n: "Pharm. Bello M.",
                r: "Chief Pharmacist, Abuja hospital",
                initials: "BM",
              },
              {
                q: "Our patients love the app — booking, lab results, paying, all from their phones. No-shows dropped by half.",
                n: "Nurse Chinwe E.",
                r: "Operations Lead, Port Harcourt",
                initials: "CE",
              },
            ].map((t) => (
              <figure key={t.n} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg">
                <div className="text-amber-400" aria-label="5 out of 5 stars">★★★★★</div>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">
                  &ldquo;{t.q}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full sky-gradient text-xs font-bold text-white">
                    {t.initials}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{t.n}</p>
                    <p className="text-xs text-slate-500">{t.r}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 py-20 text-white">
        <div className="landing-grid-bg absolute inset-0" />
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-pulse-glow rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 animate-float-y-slow rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight md:text-5xl">
            Your hospital deserves better software.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sky-50/90">
            Set up your hospital in minutes — records, billing, pharmacy, lab and a
            free website + patient app. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="btn-shine group flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-9 py-4 text-lg font-bold text-white shadow-xl shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/40"
            >
              Start Free Trial{" "}
              <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="#pricing"
              className="rounded-full border border-white/60 bg-white/15 px-9 py-4 text-lg font-semibold text-white backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:bg-white/25"
            >
              Compare Plans
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <SkyCareLogo size={44} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              The Smart Hospital OS for Africa — built by Skyhouse Technologies.
              EHR, billing, pharmacy, lab, wards, HR and analytics for hospitals of every size.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={15} className="text-emerald-600" /> Bank-grade security · Data stays in Nigeria
            </div>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://web.facebook.com/skyhouseaccountants"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyhouse Technologies on Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:text-sky-600"
              >
                <FacebookIcon className="h-4 w-4" />
              </a>
              <a
                href="https://web.facebook.com/skyhouseaccountants"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyhouse Technologies on Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-pink-400 hover:text-pink-600"
              >
                <InstagramIcon className="h-4 w-4" />
              </a>
              <a
                href="https://x.com/SkyhouseAccount"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyhouse Technologies on X"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900"
              >
                <XIcon className="h-4 w-4" />
              </a>
              <a
                href="https://www.youtube.com/@SkyhouseAccountants"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Skyhouse Technologies on YouTube"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-red-400 hover:text-red-600"
              >
                <YouTubeIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-slate-700">Contact</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-500">
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="mt-0.5 shrink-0 text-sky-600" />
                <span>
                  2/4 Moses Adeyemi Street,
                  <br />
                  Ojodu-Ikeja, Lagos, Nigeria
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone size={16} className="shrink-0 text-sky-600" />
                <a href="tel:+2348157377000" className="transition-colors hover:text-sky-600">
                  +234 815 737 7000
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone size={16} className="shrink-0 text-sky-600" />
                <a href="tel:+2347058119864" className="transition-colors hover:text-sky-600">
                  +234 705 811 9864
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-slate-700">Get Started</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
              <li><Link href="/signup" className="transition-colors hover:text-sky-600">Start Free Trial</Link></li>
              <li><Link href="/login" className="transition-colors hover:text-sky-600">Sign in</Link></li>
              <li><a href="#cta" className="transition-colors hover:text-sky-600">Contact Sales</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 py-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-400 md:flex-row">
            <p>© {new Date().getFullYear()} Skyhouse Technologies. All rights reserved.</p>
            <p>2/4 Moses Adeyemi Street, Ojodu-Ikeja, Lagos · Made in Nigeria</p>
          </div>
        </div>
      </footer>

      {/* LIVE CHAT */}
      <LiveChat />
    </main>
  );
}
