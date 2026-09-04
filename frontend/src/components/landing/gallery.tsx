"use client";

import { useState } from "react";
import Image from "next/image";
import { Globe, LayoutDashboard, Smartphone, Stethoscope } from "lucide-react";

const groups = [
  {
    id: "hospital-website",
    label: "Hospital Website",
    icon: Globe,
    kind: "browser",
    dir: "hosp-web",
    base: "",
    count: 6,
    note: "The public website every hospital gets — booking, doctors, services, contact.",
  },
  {
    id: "staff-web",
    label: "Staff Web App",
    icon: LayoutDashboard,
    kind: "browser",
    dir: "staff-webb",
    base: "mobile-workspace-board",
    count: 20,
    note: "The full HMS dashboard your admin, doctors and nurses run from any desktop.",
    nameFn: (i: number) => `mobile-workspace-board (${i}).png`,
  },
  {
    id: "staff-app",
    label: "Staff Mobile App",
    icon: Stethoscope,
    kind: "phone",
    dir: "staff-mobb",
    base: "",
    count: 8,
    ext: "png",
    note: "Doctors & nurses on the go — ward rounds, lab orders, prescribing from any phone.",
  },
  {
    id: "patient-app",
    label: "Patient App",
    icon: Smartphone,
    kind: "phone",
    dir: "patient_mobb",
    base: "",
    count: 7,
    ext: "png",
    nameFn: (i: number) => i === 1 ? "mobile-iPhone_17_Pro_Max.png" : `mobile-iPhone_17_Pro_Max (${i - 1}).png`,
    note: "What your patients see — booking, results, payments and chat in one PWA.",
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

function srcFor(base: string, dir: string, i: number, ext: string, nameFn?: (i: number) => string) {
  if (nameFn) return `/images/${dir}/${nameFn(i)}`;
  if (!base) return `/images/${dir}/${i}.${ext}`;
  return `/images/${dir}/${base}-${pad(i)}.${ext}`;
}

export function Gallery() {
  const [active, setActive] = useState(groups[0].id);
  const group = groups.find((g) => g.id === active)!;
  const ext = group.ext ?? (group.kind === "phone" ? "jpeg" : "png");
  const src = (n: number) => srcFor(group.base, group.dir, n, ext, group.nameFn);

  return (
    <section id="gallery" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
            <Smartphone size={13} /> SEE IT IN ACTION
          </span>
          <h2 className="font-heading mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            One platform, <span className="text-gradient">four experiences</span>
          </h2>
          <p className="mt-3 text-slate-600">
            Real screens from SkyCare — the hospital website, the staff web dashboard,
            the staff mobile app and the patient app.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActive(g.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                active === g.id
                  ? "sky-gradient text-white shadow-md"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-600"
              }`}
            >
              <g.icon size={15} />
              {g.label}
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">{group.note}</p>

        {group.kind === "browser" ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: group.count }, (_, i) => i + 1).map((n) => (
              <figure
                key={n}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-xs text-slate-400 ring-1 ring-slate-200">
                    app.skycare.app
                  </span>
                </div>
                <div className="relative aspect-video bg-slate-50">
                  <Image
                    src={src(n)}
                    alt={`${group.label} screenshot ${n}`}
                    fill
                    unoptimized
                    className="object-cover object-top"
                  />
                </div>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-8 sm:gap-y-10">
            {Array.from({ length: group.count }, (_, i) => i + 1).map((n) => (
              <figure
                key={n}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative w-[110px] bg-slate-900 p-0.5 sm:w-[120px]">
                  <div className="absolute left-1/2 top-0.5 z-10 h-0.5 w-6 -translate-x-1/2 rounded-full bg-slate-700" />
                  <Image
                    src={src(n)}
                    alt={`${group.label} screenshot ${n}`}
                    width={120}
                    height={260}
                    unoptimized
                    className="h-auto w-full object-contain"
                  />
                </div>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
