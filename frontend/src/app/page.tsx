import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BedDouble,
  Boxes,
  Building2,
  CalendarCheck,
  Check,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Globe,
  HeartPulse,
  LineChart,
  MessageSquareText,
  MonitorSmartphone,
  Pill,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
} from "lucide-react";

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
    ngn: "15,000",
    usd: "10",
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
    ngn: "40,000",
    usd: "26",
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
    ngn: "100,000+",
    usd: "65+",
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

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl sky-gradient text-white">
              <HeartPulse size={20} />
            </span>
            <span className="text-xl font-bold tracking-tight">
              Sky<span className="text-sky-600">Care</span>
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-sky-600">Features</a>
            <a href="#modules" className="hover:text-sky-600">Modules</a>
            <a href="#pricing" className="hover:text-sky-600">Pricing</a>
            <a href="#hospital-website" className="hover:text-sky-600">Hospital Website</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-slate-700 hover:text-sky-600 sm:block">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg sky-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="sky-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Building2 size={13} /> Built by Skyhouse Technologies · Nigeria
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Run Your Hospital Smarter — <span className="text-sky-200">From Anywhere</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-sky-50/90">
            SkyCare is the all-in-one hospital management OS for Nigeria and Africa —
            EHR, billing, pharmacy, lab, wards, HR and analytics. Every hospital also
            gets a free website and a patient app.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-sky-700 shadow-lg hover:bg-sky-50"
            >
              Start Free Trial <ArrowRight size={18} />
            </Link>
            <Link
              href="#pricing"
              className="rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              See Pricing
            </Link>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 text-left sm:grid-cols-4">
            {[
              { icon: MonitorSmartphone, label: "Works on any device" },
              { icon: ShieldCheck, label: "Bank-grade security" },
              { icon: Globe, label: "Cloud + on-premise" },
              { icon: Smartphone, label: "Free patient PWA app" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-white/10 p-4 backdrop-blur">
                <f.icon size={22} className="text-sky-200" />
                <p className="mt-2 text-sm font-medium text-sky-50">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Everything your hospital runs on, <span className="text-gradient">in one system</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Nine deep modules replace your papers, spreadsheets and separate apps —
            with one patient record at the center of it all.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-200 p-6 transition hover:border-sky-300 hover:shadow-lg"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition group-hover:bg-sky-600 group-hover:text-white">
                  <f.icon size={22} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Purpose-built for <span className="text-gradient">Nigerian & African healthcare</span>
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m}
                className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
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

      {/* HOSPITAL WEBSITE */}
      <section id="hospital-website" className="py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              <Globe size={13} /> INCLUDED IN EVERY PLAN
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
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
                  <Check size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
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
                  className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
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
              <div className="flex items-center gap-3 rounded-xl bg-sky-50 p-3">
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
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Simple pricing, <span className="text-gradient">built for Nigerian budgets</span>
          </h2>
          <p className="mt-3 text-center text-slate-600">
            Every plan includes the hospital website and patient app. Prices in NGN; USD shown at current rates.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {pricing.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                  p.highlight
                    ? "border-sky-500 shadow-2xl ring-2 ring-sky-500/30"
                    : "border-slate-200"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full sky-gradient px-3 py-1 text-xs font-bold text-white">
                    MOST POPULAR
                  </span>
                )}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
                <div className="mt-4">
                  <span className="text-3xl font-extrabold">₦{p.ngn}</span>
                  <span className="text-sm text-slate-500"> /{p.per}</span>
                </div>
                <p className="text-xs text-slate-400">≈ ${p.usd} USD</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${
                    p.highlight
                      ? "sky-gradient text-white hover:opacity-90"
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
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Trusted by hospitals <span className="text-gradient">across Africa</span>
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                q: "We stopped losing invoices and patients. Revenue visibility alone paid for the subscription in the first month.",
                n: "Dr. Amina B.",
                r: "Medical Director, Lagos clinic",
              },
              {
                q: "The pharmacy module ended our stockouts. Expiry alerts and reorder levels run themselves now.",
                n: "Pharm. Bello M.",
                r: "Chief Pharmacist, Abuja hospital",
              },
              {
                q: "Our patients love the app — booking, lab results, paying, all from their phones. No-shows dropped by half.",
                n: "Nurse Chinwe E.",
                r: "Operations Lead, Port Harcourt",
              },
            ].map((t) => (
              <figure key={t.n} className="rounded-2xl border border-slate-200 p-6">
                <div className="text-amber-400">★★★★★</div>
                <blockquote className="mt-3 text-sm leading-relaxed text-slate-700">
                  &ldquo;{t.q}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <p className="font-semibold">{t.n}</p>
                  <p className="text-slate-500">{t.r}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="sky-gradient py-20 text-white">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-5xl">
            Your hospital deserves better software.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sky-50/90">
            Set up your hospital in minutes — records, billing, pharmacy, lab and a
            free website + patient app. No credit card required.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-white px-8 py-3.5 text-lg font-bold text-sky-700 shadow-lg hover:bg-sky-50"
            >
              Start Free Trial
            </Link>
            <Link
              href="#pricing"
              className="rounded-xl border border-white/40 px-8 py-3.5 font-semibold hover:bg-white/10"
            >
              Compare Plans
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 md:flex-row">
          <p className="font-semibold text-slate-700">
            Sky<span className="text-sky-600">Care</span> — The Smart Hospital OS for Africa
          </p>
          <p>© {new Date().getFullYear()} Skyhouse Technologies. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}