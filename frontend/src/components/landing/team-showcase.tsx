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
    imgs: ["staff-app-01", "staff-app-02", "staff-app-03"],
  },
  {
    icon: Syringe,
    title: "Nurses",
    desc: "Vitals, medication administration, ward rounds and handover documentation on any phone.",
    imgs: ["staff-app-04", "staff-app-05", "staff-app-06"],
  },
  {
    icon: Microscope,
    title: "Pharmacists",
    desc: "Dispense against e-prescriptions, track stock, and catch drug interactions instantly.",
    imgs: ["staff-app-07", "staff-app-08", "staff-app-09"],
  },
  {
    icon: UserCog,
    title: "Admins",
    desc: "Billing, insurance claims, rosters, reports and revenue analytics from the executive dashboard.",
    imgs: ["staff-app-10", "staff-app-11", "staff-app-12"],
  },
  {
    icon: Headset,
    title: "Reception & Support",
    desc: "Front-desk registration, appointment booking, and patient communication in one place.",
    imgs: ["staff-app-13", "staff-app-14", "staff-app-15"],
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

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-5 flex items-end justify-center gap-3">
                {r.imgs.map((img, j) => (
                  <div
                    key={img}
                    className={`w-16 overflow-hidden rounded-xl border-2 border-slate-200 shadow-lg transition-transform duration-300 group-hover:shadow-xl ${
                      j === 1 ? "z-10 -translate-y-2 sm:w-20" : "opacity-90"
                    }`}
                  >
                    <div className="relative aspect-[9/19] bg-slate-900">
                      <Image
                        src={`/images/staff-app-images/${img}.jpeg`}
                        alt={`${r.title} using the SkyCare staff app`}
                        fill
                        sizes="96px"
                        className="object-cover object-top"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
