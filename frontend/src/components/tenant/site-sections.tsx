import Link from "next/link";
import {
  CalendarCheck,
  Globe,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import {
  type LandingDoctor,
  type WebsiteDepartment,
  type WebsiteService,
  serviceIcon,
} from "@/lib/tenant-site";

const brandClass = "[background:var(--brand)]";
const brandSoftClass = "[background:color-mix(in_srgb,var(--brand)_12%,transparent)]";
const brandTextClass = "[color:var(--brand)]";

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <section className={brandClass}>
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-3xl font-extrabold text-white md:text-4xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-2xl text-white/85">{subtitle}</p>}
      </div>
    </section>
  );
}

export function ServicesGrid({
  services,
  home,
  title = "Our Services",
  subtitle,
}: {
  services: WebsiteService[];
  home: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => {
            const Icon = serviceIcon(s.icon);
            return (
              <div key={s.id} className="rounded-xl border border-slate-100 p-5 shadow-sm">
                <span className={brandSoftClass}>
                  <Icon size={22} className={brandTextClass} />
                </span>
                <p className="mt-3 font-semibold">{s.name}</p>
                {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link
            href={`${home}/book`}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white hover:opacity-90 ${brandClass}`}
          >
            <CalendarCheck size={16} /> Book an Appointment
          </Link>
        </div>
      </div>
    </section>
  );
}

export function DepartmentsGrid({
  departments,
  home,
}: {
  departments: WebsiteDepartment[];
  home: string;
}) {
  if (departments.length === 0) return null;
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-2xl font-bold">Departments</h2>
        <p className="mt-2 text-slate-600">
          Our hospital is organised into specialised departments so you get the right care.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => {
            const Icon = serviceIcon(d.icon);
            return (
              <div key={d.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <span className={brandSoftClass}>
                  <Icon size={20} className={brandTextClass} />
                </span>
                <p className="mt-3 font-semibold">{d.name}</p>
                {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link
            href={`${home}/book`}
            className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white hover:opacity-90 ${brandClass}`}
          >
            <CalendarCheck size={16} /> Book an Appointment
          </Link>
        </div>
      </div>
    </section>
  );
}

export function DoctorsGrid({
  doctors,
  home,
}: {
  doctors: LandingDoctor[];
  home: string;
}) {
  if (doctors.length === 0) return null;
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-2xl font-bold">Meet Our Doctors</h2>
        <p className="mt-2 text-slate-600">
          Our team of qualified and compassionate medical professionals is ready to care for you.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="rounded-xl border border-slate-100 bg-white p-6 text-center shadow-sm"
            >
              <div className={`mx-auto flex h-[110px] w-[110px] items-center justify-center overflow-hidden rounded-full text-white shadow-md ${brandClass}`}>
                {doctor.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doctor.image_url} alt={doctor.name} className="h-full w-full object-cover" />
                ) : (
                  <UserRound size={44} aria-hidden="true" />
                )}
              </div>
              <h3 className="mt-4 font-semibold">{doctor.name}</h3>
              <p className="text-sm text-slate-600">{doctor.specialty}</p>
              <span
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  doctor.available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    doctor.available ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {doctor.available ? "Available" : "Limited Availability"}
              </span>
              {doctor.availability && (
                <p className="mt-2 text-xs text-slate-500">{doctor.availability}</p>
              )}
              <Link
                href={`${home}/book`}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition-all hover:opacity-90 ${brandClass}`}
              >
                <CalendarCheck size={14} /> Book Appointment
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactCards({
  tenant,
  showMap = false,
}: {
  tenant: {
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    website_url: string | null;
    emergency_phone: string | null;
  };
  showMap?: boolean;
}) {
  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ") || null;
  const cards: { icon: typeof Phone; label: string; value: string | null; href?: string }[] = [
    { icon: Phone, label: "Phone", value: tenant.phone ?? null, href: tenant.phone ? `tel:${tenant.phone}` : undefined },
    { icon: Mail, label: "Email", value: tenant.email ?? null, href: tenant.email ? `mailto:${tenant.email}` : undefined },
    { icon: MapPin, label: "Address", value: address },
  ];
  if (tenant.emergency_phone) {
    cards.unshift({
      icon: Phone,
      label: "Emergency",
      value: tenant.emergency_phone,
      href: `tel:${tenant.emergency_phone}`,
    });
  }
  if (tenant.website_url) {
    cards.push({ icon: Globe, label: "Website", value: tenant.website_url, href: tenant.website_url });
  }
  void showMap;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="flex items-center gap-3 rounded-xl bg-white p-5 shadow-sm">
          <span className={brandSoftClass}>
            <c.icon size={20} className={brandTextClass} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{c.label}</p>
            {c.href ? (
              <a
                href={c.href}
                {...(c.label === "Website"
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="block truncate text-sm font-semibold hover:underline"
              >
                {c.value}
              </a>
            ) : (
              <p className="text-sm font-semibold">{c.value ?? "—"}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
