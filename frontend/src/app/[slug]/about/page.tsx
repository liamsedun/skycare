import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Eye,
  Flag,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Lightbulb,
  LogIn,
  MapPin,
  Microscope,
  Phone,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getHost, loadTenant } from "@/lib/tenant";
import {
  loadLandingDoctors,
  loadWebsiteDepartments,
  loadWebsitePage,
  loadWebsiteServices,
  tenantAddress,
} from "@/lib/tenant-site";
import Reveal from "@/components/tenant/reveal";

export const dynamic = "force-dynamic";

/* ---------- write-up parser ----------
 * `website_pages` about content is a flat string array where short lines
 * without a trailing period are headings and longer sentences are bodies.
 * Group headers ("Vision, Mission & Goals", "Hospital Building", "Why Choose
 * ...") introduce card groups; consecutive headings merge into one title.
 */
type AboutCard = { heading: string; lines: string[] };
type AboutSection = { heading: string; cards: AboutCard[] };
type AboutParsed = {
  intro: AboutCard | null;
  pillars: AboutCard[];
  sections: AboutSection[];
  tagline: string | null;
  taglineLines: string[];
  ctaButtons: string[];
};

const ABOUT_GROUP_HEADERS = new Set([
  "Vision, Mission & Goals",
  "Hospital Building",
  "Why Choose Life Blossom?",
  "Why Choose Us?",
]);

const ABOUT_CTA_RE = /^(book appointment|book an appointment|explore our services|contact us)$/i;
const ABOUT_TAGLINE_RE = /where care meets cure|your health, our priority/i;

function isHeading(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && !/\.$/.test(t);
}

export function parseAboutWriteups(paragraphs: string[]): AboutParsed {
  const topCards: AboutCard[] = [];
  const sections: AboutSection[] = [];
  const ctaButtons: string[] = [];
  let tagline: string | null = null;
  const taglineLines: string[] = [];
  let section: AboutSection | null = null;
  let card: AboutCard | null = null;

  const flushCard = () => {
    if (!card) return;
    if (card.lines.length > 0) {
      if (section) section.cards.push(card);
      else topCards.push(card);
    }
    card = null;
  };

  for (const raw of paragraphs) {
    const s = (raw ?? "").trim();
    if (!s) continue;

    if (ABOUT_CTA_RE.test(s)) {
      flushCard();
      ctaButtons.push(s);
      continue;
    }
    if (ABOUT_TAGLINE_RE.test(s)) {
      flushCard();
      tagline = s;
      continue;
    }
    if (isHeading(s)) {
      if (ABOUT_GROUP_HEADERS.has(s)) {
        flushCard();
        section = { heading: s, cards: [] };
        sections.push(section);
        continue;
      }
      if (card && card.lines.length === 0) {
        card.heading = card.heading ? `${card.heading} ${s}` : s;
        continue;
      }
      flushCard();
      card = { heading: s, lines: [] };
      continue;
    }
    if (tagline) {
      taglineLines.push(s);
      continue;
    }
    if (!card) card = { heading: "", lines: [] };
    card.lines.push(s);
  }
  flushCard();

  const intro = topCards.length ? topCards[0] : null;
  return {
    intro,
    pillars: topCards.slice(1),
    sections,
    tagline,
    taglineLines,
    ctaButtons,
  };
}

function cardIcon(heading: string): LucideIcon {
  const h = heading.toLowerCase();
  if (h.includes("vision")) return Eye;
  if (h.includes("mission")) return Target;
  if (h.includes("goal")) return Flag;
  if (h.includes("access") || h.includes("underserved")) return Users;
  if (h.includes("education") || h.includes("research")) return GraduationCap;
  if (h.includes("innov")) return Lightbulb;
  if (h.includes("hospital building") || h.includes("liamsfield hospital")) return Building2;
  if (h.includes("puts you first") || h.includes("heart")) return HeartHandshake;
  if (h.includes("expert") || h.includes("doctor")) return Stethoscope;
  if (h.includes("24/7") || h.includes("emergency")) return Siren;
  if (h.includes("modern") || h.includes("facilities") || h.includes("diagnostics"))
    return Microscope;
  if (h.includes("patient first")) return UserCheck;
  return HeartPulse;
}

function CardBody({ lines }: { lines: string[] }) {
  if (lines.length > 1) {
    return (
      <ul className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#16A34A]" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="mt-3 text-sm leading-relaxed text-slate-600">{lines[0]}</p>;
}

export default async function TenantAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost();
  const { tenant } = await loadTenant(host ?? slug);
  if (!tenant) notFound();

  const home = `/${tenant.slug}`;
  const cms = await loadWebsitePage(tenant.id, "about");
  const about = tenant.about ?? "Quality healthcare for your community.";
  const paragraphs: string[] =
    Array.isArray(cms?.content.paragraphs) && cms.content.paragraphs.length > 0
      ? (cms.content.paragraphs as string[])
      : [about];

  const parsed = parseAboutWriteups(paragraphs);
  const hasParsed = parsed.intro !== null || parsed.pillars.length > 0 || parsed.sections.length > 0;

  const [services, departments, doctors] = await Promise.all([
    loadWebsiteServices(tenant.id),
    loadWebsiteDepartments(tenant.id),
    loadLandingDoctors(tenant.id),
  ]);

  const stats = [
    { value: `${services.length || 8}+`, label: "Medical Services" },
    { value: `${doctors.length || 20}+`, label: "Expert Doctors" },
    { value: `${departments.length || 5}`, label: "Departments" },
    { value: "24/7", label: "Emergency Care" },
  ];

  const visionSection = parsed.sections.find((s) => /vision/i.test(s.heading));
  const hospitalSection = parsed.sections.find((s) => /hospital building/i.test(s.heading));
  const whySection = parsed.sections.find((s) => /why choose/i.test(s.heading));

  /* legacy fallback content when the CMS write-ups are absent */
  const values = [
    {
      icon: HeartHandshake,
      title: "Compassionate Care",
      text: "Every patient is treated with dignity, empathy and a personal touch.",
    },
    {
      icon: ShieldCheck,
      title: "Safety First",
      text: "Strict clinical standards, hygiene and patient confidentiality at all times.",
    },
    {
      icon: Target,
      title: "Excellence",
      text: "A skilled team and modern equipment delivering measurable outcomes.",
    },
  ];

  const features = [
    {
      icon: Stethoscope,
      title: "Experienced doctors",
      text: "Qualified specialists across general practice, cardiology, paediatrics and more.",
    },
    {
      icon: HeartPulse,
      title: "Modern diagnostics",
      text: "In-house laboratory and diagnostic imaging for fast, accurate results.",
    },
    {
      icon: ShieldCheck,
      title: "Trusted pharmacy",
      text: "Certified medication dispensed by licensed pharmacists with your safety in mind.",
    },
    {
      icon: CalendarCheck,
      title: "Easy appointments",
      text: "Book online in under a minute and follow up through your patient portal.",
    },
  ];

  const ctaButtons =
    parsed.ctaButtons.length > 0
      ? parsed.ctaButtons.map((label) =>
          /^book/i.test(label)
            ? { label, href: `${home}/book`, icon: CalendarCheck as LucideIcon }
            : { label, href: `${home}#services`, icon: Sparkles as LucideIcon }
        )
      : [
          { label: "Book an Appointment", href: `${home}/book`, icon: CalendarCheck as LucideIcon },
          { label: "Patient Login", href: `${home}/login`, icon: LogIn as LucideIcon },
        ];

  const address = tenantAddress(tenant);

  return (
    <main>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F4C81] via-[#0B3A63] to-[#071E38]">
        <div className="pointer-events-none absolute -left-24 top-8 h-80 w-80 rounded-full bg-[#16A34A]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />

        {/* floating deco icons */}
        <svg className="tenant-floaty absolute left-[12%] top-[22%] hidden md:block" width="16" height="16" viewBox="0 0 24 24" fill="#fff" opacity="0.25" aria-hidden="true">
          <rect x="10" y="2" width="4" height="20" rx="2" />
          <rect x="2" y="10" width="20" height="4" rx="2" />
        </svg>
        <svg className="tenant-floaty tenant-floaty-d2 absolute right-[14%] top-[26%] hidden md:block" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" opacity="0.3" aria-hidden="true">
          <path className="tenant-pulse-line" d="M2 12h4l2-7 4 14 3-9 2 4h5" />
        </svg>
        <svg className="tenant-floaty tenant-floaty-d3 absolute right-[22%] bottom-[18%] hidden md:block" width="14" height="14" viewBox="0 0 24 24" fill="#fff" opacity="0.25" aria-hidden="true">
          <rect x="10" y="2" width="4" height="20" rx="2" />
          <rect x="2" y="10" width="20" height="4" rx="2" />
        </svg>

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-36 text-center md:pb-24 md:pt-44">
          <Reveal>
            <a
              href={`${home}#home`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <ArrowRight size={13} className="rotate-180" /> Back to Home
            </a>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              {cms?.title ?? `About ${tenant.name}`}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              {typeof cms?.content.subtitle === "string" && cms.content.subtitle
                ? cms.content.subtitle
                : cms?.title
                ? "Our story, our people, our promise to the community."
                : "Quality healthcare for your community."}
            </p>
          </Reveal>

          <Reveal delay={150} className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-5 backdrop-blur-sm"
              >
                <p className="text-2xl font-extrabold text-white md:text-3xl">{s.value}</p>
                <p className="mt-1 text-xs text-white/70">{s.label}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Story / intro */}
      <section className="bg-[#F7F9FC] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
            <Reveal>
              <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                Our Story
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                {parsed.intro?.heading ?? "Healthcare that puts you first"}
              </h2>
              <div className="mt-6 space-y-4">
                {(parsed.intro?.lines.length ? parsed.intro.lines : paragraphs).map((p, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? "text-lg font-medium leading-relaxed text-[#1F2D3D]"
                        : "leading-relaxed text-slate-600"
                    }
                  >
                    {p}
                  </p>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`${home}/book`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#16A34A]/25 transition-all hover:bg-[#15803d] hover:shadow-xl active:scale-[0.97]"
                >
                  <CalendarCheck size={16} /> Book an Appointment
                </Link>
                <a
                  href={`tel:${tenant.phone}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#0F4C81]/20 px-6 py-3 text-sm font-semibold text-[#0F4C81] transition-all hover:border-[#0F4C81] hover:bg-[#0F4C81] hover:text-white active:scale-[0.97]"
                >
                  <Phone size={16} /> Call Us
                </a>
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div className="relative">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#16A34A]/15 to-[#0F4C81]/15" />
                <div className="relative overflow-hidden rounded-[1.75rem] border border-white shadow-2xl shadow-[#0B3A63]/15">
                  {tenant.about_story_image ?? tenant.hero_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tenant.about_story_image ?? tenant.hero_image}
                      alt={tenant.name}
                      className="h-[320px] w-full object-cover md:h-[420px]"
                    />
                  ) : (
                    <div className="flex h-[320px] w-full items-center justify-center bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] md:h-[420px]">
                      <HeartPulse size={72} className="text-white/40" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-5 left-6 rounded-2xl bg-white px-5 py-4 shadow-xl ring-1 ring-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {tenant.name}
                  </p>
                  <p className="text-sm font-bold text-[#0F4C81]">
                    Caring for our community every day
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Pillars — Access for All / Education & Research / Continuous Innovation */}
      {parsed.pillars.length > 0 && (
        <section className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <Reveal className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                What Drives Us
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                The pillars of our care
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {parsed.pillars.map((p, i) => {
                const Icon = cardIcon(p.heading);
                return (
                  <Reveal key={p.heading} delay={i * 120}>
                    <div className="group h-full rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#16A34A]/30 hover:shadow-xl hover:shadow-[#16A34A]/10">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F7F2] text-[#16A34A] transition-colors group-hover:bg-[#16A34A] group-hover:text-white">
                        <Icon size={26} />
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-[#1F2D3D]">{p.heading}</h3>
                      <CardBody lines={p.lines} />
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Vision / Mission / Goals */}
      {visionSection && (
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0F4C81] via-[#0B3A63] to-[#071E38] py-16 md:py-24">
          <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-[#16A34A]/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5">
            <Reveal className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#34D399]">
                What We Stand For
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">
                {visionSection.heading}
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {visionSection.cards.map((c, i) => {
                const Icon = cardIcon(c.heading);
                return (
                  <Reveal key={c.heading} delay={i * 120}>
                    <div className="h-full rounded-2xl border border-white/15 bg-white/10 p-8 backdrop-blur-sm transition-colors hover:bg-white/15">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#16A34A]/25 text-[#34D399]">
                        <Icon size={26} />
                      </span>
                      <h3 className="mt-5 text-lg font-bold text-white">{c.heading}</h3>
                      {c.lines.length > 1 ? (
                        <ul className="mt-3 space-y-2">
                          {c.lines.map((l, j) => (
                            <li
                              key={j}
                              className="flex items-start gap-2.5 text-sm leading-relaxed text-white/80"
                            >
                              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#34D399]" />
                              <span>{l}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm leading-relaxed text-white/80">{c.lines[0]}</p>
                      )}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Hospital Building */}
      {hospitalSection && (
        <section className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
              <Reveal>
                <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                  Our Facility
                </span>
                <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                  {hospitalSection.heading}
                </h2>
                {hospitalSection.cards.map((c) => {
                  const Icon = cardIcon(c.heading);
                  return (
                    <div key={c.heading} className="mt-8 rounded-2xl border border-slate-100 bg-[#F7F9FC] p-8 shadow-sm">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EAF0F7] text-[#0F4C81]">
                          <Icon size={24} />
                        </span>
                        <h3 className="text-lg font-bold text-[#1F2D3D]">{c.heading}</h3>
                      </div>
                      <p className="mt-4 leading-relaxed text-slate-600">{c.lines.join(" ")}</p>
                    </div>
                  );
                })}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={`tel:${tenant.phone}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#0F4C81]/20 px-6 py-3 text-sm font-semibold text-[#0F4C81] transition-all hover:border-[#0F4C81] hover:bg-[#0F4C81] hover:text-white active:scale-[0.97]"
                  >
                    <Phone size={16} /> Call Us
                  </a>
                  {address && (
                    <span className="inline-flex items-center gap-2 px-2 py-3 text-sm text-slate-500">
                      <MapPin size={16} className="shrink-0 text-[#16A34A]" /> {address}
                    </span>
                  )}
                </div>
              </Reveal>

              <Reveal delay={150}>
                <div className="relative">
                  <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[#0F4C81]/10 to-[#16A34A]/10" />
                  {tenant.facility_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tenant.facility_image}
                      alt={`${tenant.name} Hospital Building`}
                      className="h-[360px] w-full object-cover md:h-[440px]"
                    />
                  ) : (
                    <div className="relative flex h-[360px] items-center justify-center overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] shadow-2xl shadow-[#0B3A63]/20 md:h-[440px]">
                      <div className="text-center">
                        <Building2 size={72} className="mx-auto text-white/40" />
                        <p className="mt-4 text-sm font-semibold text-white/70">
                          {tenant.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {/* Why Choose */}
      {whySection ? (
        <section className="bg-[#F7F9FC] py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <Reveal className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                Why Choose Us
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                {whySection.heading}
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {whySection.cards.map((c, i) => {
                const Icon = cardIcon(c.heading);
                return (
                  <Reveal key={c.heading} delay={i * 100}>
                    <div className="group h-full rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-[#0F4C81]/10">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF0F7] text-[#0F4C81] transition-colors group-hover:bg-[#0F4C81] group-hover:text-white">
                        <Icon size={24} />
                      </span>
                      <h3 className="mt-4 font-bold text-[#1F2D3D]">{c.heading}</h3>
                      <CardBody lines={c.lines} />
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        /* legacy fallback "why choose" grid */
        <section className="bg-[#F7F9FC] py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
              <Reveal>
                <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                  Why Choose Us
                </span>
                <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                  Everything you need, under one roof
                </h2>
                <p className="mt-4 leading-relaxed text-slate-600">
                  From consultation and diagnostics to pharmacy and follow-up care, we make it
                  convenient to get the treatment you deserve.
                </p>
                <div className="mt-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F4C81] to-[#0B3A63] p-8 text-white shadow-xl">
                  <p className="text-sm text-white/80">Prefer to talk to someone?</p>
                  <p className="mt-1 text-2xl font-extrabold">{tenant.phone ?? "Call us"}</p>
                  <p className="mt-1 text-sm text-white/70">
                    {tenant.emergency_phone
                      ? `Emergency: ${tenant.emergency_phone}`
                      : "We're here to help."}
                  </p>
                </div>
              </Reveal>

              <div className="grid gap-5 sm:grid-cols-2">
                {features.map((f, i) => (
                  <Reveal key={f.title} delay={i * 100}>
                    <div className="group h-full rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-[#0F4C81]/10">
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF0F7] text-[#0F4C81] transition-colors group-hover:bg-[#0F4C81] group-hover:text-white">
                        <f.icon size={24} />
                      </span>
                      <h3 className="mt-4 font-bold text-[#1F2D3D]">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Values fallback (only when CMS write-ups are absent) */}
      {!hasParsed && (
        <section className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <Reveal className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-[#16A34A]">
                What We Stand For
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-[#0F4C81] md:text-4xl">
                Our promise to you
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {values.map((v, i) => (
                <Reveal key={v.title} delay={i * 120}>
                  <div className="group h-full rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#16A34A]/30 hover:shadow-xl hover:shadow-[#16A34A]/10">
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F7F2] text-[#16A34A] transition-colors group-hover:bg-[#16A34A] group-hover:text-white">
                      <v.icon size={26} />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-[#1F2D3D]">{v.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative overflow-hidden bg-[#0B3A63] py-16">
        <div className="pointer-events-none absolute -left-16 top-0 h-72 w-72 rounded-full bg-[#16A34A]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
        <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
          <HeartPulse size={40} className="mx-auto text-[#16A34A]" />
          <h2 className="mt-4 text-3xl font-extrabold text-white md:text-4xl">
            {parsed.tagline ?? "Ready to see us?"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            {parsed.taglineLines.length
              ? parsed.taglineLines.join(" ")
              : "Book an appointment online in under a minute — our team will call you back to confirm."}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {ctaButtons.map((btn) => (
              <Link
                key={btn.label}
                href={btn.href}
                className={
                  /book/i.test(btn.label)
                    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#16A34A]/30 transition-all hover:bg-[#15803d] hover:shadow-xl active:scale-[0.97]"
                    : "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/30 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-[#16A34A] hover:bg-[#16A34A] active:scale-[0.97]"
                }
              >
                <btn.icon size={16} /> {btn.label}
              </Link>
            ))}
          </div>
        </Reveal>
      </section>
    </main>
  );
}
