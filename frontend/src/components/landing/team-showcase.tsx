import Image from "next/image";
import {
  Headset,
  Microscope,
  Stethoscope,
  Syringe,
  UserCog,
} from "lucide-react";

const roles = [
  {
    icon: Stethoscope,
    title: "Doctors",
    desc: "Consult, prescribe, review labs and write notes from the ward or clinic — all from one record.",
    img: "/images/doctors/mobile-iPhone_17_Pro_Max-full.png",
  },
  {
    icon: Syringe,
    title: "Nurses",
    desc: "Vitals, medication administration, ward rounds and handover documentation on any phone.",
    img: "/images/nurses/mobile-iPhone_17_Pro_Max-full (2).png",
  },
  {
    icon: Microscope,
    title: "Pharmacists",
    desc: "Dispense against e-prescriptions, track stock, and catch drug interactions instantly.",
    img: "/images/pharmacist/mobile-iPhone_17_Pro_Max-full (5).png",
  },
  {
    icon: UserCog,
    title: "Admins",
    desc: "Billing, insurance claims, rosters, reports and revenue analytics from the executive dashboard.",
    img: "/images/admin/mobile-iPhone_17_Pro_Max-full (1).png",
  },
  {
    icon: Headset,
    title: "Reception & Support",
    desc: "Front-desk registration, appointment booking, and patient communication in one place.",
    img: "/images/pharmacist/mobile-iPhone_17_Pro_Max-full (5).png",
  },
];

export function TeamShowcase() {
  return (
    <section id="team" className="scroll-mt-20 bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
            <Stethoscope size={13} /> MADE FOR YOUR WHOLE TEAM
          </span>
          <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Every role in your hospital, <span className="text-gradient">on one platform</span>
          </h2>
          <p className="mt-3 text-slate-600">
            From the front desk to the operating theatre — doctors, nurses, pharmacists
            and admins work from the same live patient record.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {roles.map((r, i) => (
            <div
              key={r.title}
              className={`group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${
                i === roles.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl sky-gradient text-white shadow-md">
                  <r.icon size={20} />
                </span>
                <h3 className="font-heading text-lg font-semibold">{r.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.desc}</p>
              <div className="mt-5 overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-900 shadow-lg transition-transform duration-300 group-hover:shadow-xl">
                <div className="relative aspect-[16/10]">
                  <Image
                    src={r.img}
                    alt={`${r.title} using the SkyCare staff app`}
                    fill
                    sizes="(max-width: 768px) 100vw, 600px"
                    className="object-contain"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
