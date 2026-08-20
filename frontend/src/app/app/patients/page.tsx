import Link from "next/link";
import { Search, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, getClaims } from "@/lib/auth";
import StatusBadge from "@/components/dashboard/status-badge";
import { PatientViewButton, type PatientRow } from "@/components/dashboard/patient-dialog";
import { patientGradient, patientInitials } from "@/lib/patient-avatar";
import { mutedXs, mutedFg, mutedSm, divideBorder, fgMedium, sectionTitle, pageTitle, tableHeadCell } from "@/lib/ui-constants";
import PatientActions from "@/components/dashboard/patient-actions";

export const dynamic = "force-dynamic";

type PatientCategory = "active" | "inactive" | "dependants";

const PATIENT_CATEGORIES: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "dependants", label: "Dependants" },
];

interface PatientRowRaw {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  status: string;
  created_at: string;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; from?: string; to?: string }>;
}) {
  const { q, category, from, to } = await searchParams;
  const query = q?.trim() ?? "";
  const fromDate = from?.trim() ?? "";
  const toDate = to?.trim() ?? "";
  const cat = (PATIENT_CATEGORIES.find((c) => c.key === category)?.key ?? "") as "" | PatientCategory;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myRole = user ? getClaims(user).role : undefined;
  let patients: PatientRow[] = [];

  try {
    let builder = supabase
      .from("patients")
      .select(
        "id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, city, state, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (cat === "active") builder = builder.eq("status", "active");
    if (cat === "inactive") builder = builder.eq("status", "inactive");
    if (cat === "dependants") builder = builder.not("primary_account_id", "is", null);

    if (query) {
      builder = builder.or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%,patient_number.ilike.%${query}%,phone.ilike.%${query}%`
      );
    }

    if (fromDate) builder = builder.gte("created_at", `${fromDate}T00:00:00`);
    if (toDate) builder = builder.lte("created_at", `${toDate}T23:59:59.999`);

    const { data } = await builder;
    patients = (data ?? []) as PatientRowRaw[];
  } catch {
    patients = [];
  }

  const catLabel =
    cat === "active" ? "active patient(s)" : cat === "inactive" ? "inactive patient(s)" : cat === "dependants" ? "dependant(s)" : "patient(s)";
  const chipHref = (key: string) => {
    const params = new URLSearchParams();
    if (key) params.set("category", key);
    if (query) params.set("q", query);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const qs = params.toString();
    return `/app/patients${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={pageTitle}>
            Patients
          </h1>
          <p className={mutedSm}>
            {query ? `${patients.length} result(s) for "${query}"` : `${patients.length} ${catLabel} on record`}
          </p>
        </div>
        <PatientActions patients={patients} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by patient category">
        {PATIENT_CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={chipHref(c.key)}
            aria-current={cat === c.key ? "page" : undefined}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
              cat === c.key
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <form method="get" role="search" aria-label="Search patients">
        <label htmlFor="patient-search" className="sr-only">
          Search patients
        </label>
        <div className="relative max-w-md">
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]"
          />
          <input
            id="patient-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, number or phone…"
            className="focus-ring w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--color-muted-fg)] focus:border-[var(--color-primary)]"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className={mutedXs} htmlFor="patient-from">From</label>
          <input
            id="patient-from"
            type="date"
            name="from"
            defaultValue={fromDate}
            className="focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs outline-none"
          />
          <label className={mutedXs} htmlFor="patient-to">To</label>
          <input
            id="patient-to"
            type="date"
            name="to"
            min={fromDate || undefined}
            defaultValue={toDate}
            className="focus-ring h-9 rounded-lg border border-[var(--color-border)] bg-white px-2 text-xs outline-none"
          />
          <button type="submit" className="focus-ring h-9 rounded-lg bg-[var(--color-primary)] px-3 text-xs font-medium text-white transition-opacity duration-200 hover:opacity-90">
            Apply dates
          </button>
        </div>
      </form>

      {patients.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white py-16 text-center shadow-[var(--shadow-sm)]">
          <UserRound
            size={40}
            aria-hidden="true"
            className="mx-auto text-[var(--color-muted-fg)]"
          />
          <p className={sectionTitle}>
            {query ? "No patients match your search." : "No patients yet."}
          </p>
          <p className={mutedSm}>
            Patients are added at registration, or via the booking link on your website.
          </p>
        </div>
      ) : (
        <div className="space-y-3 md:hidden">
          {patients.map((patient) => (
            <div
              key={patient.id}
              className="rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${patientGradient(patient.id)} text-xs font-bold text-white shadow-sm ring-2 ring-white`}
                  >
                    {patientInitials(patient.first_name, patient.last_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--color-foreground)]">
                      {patient.last_name}, {patient.first_name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-[var(--color-primary-dark)]">
                      {patient.patient_number}
                    </p>
                  </div>
                </div>
                <StatusBadge status={patient.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className={mutedFg}>DOB</dt>
                  <dd className={fgMedium}>
                    {formatDate(patient.date_of_birth)}
                  </dd>
                </div>
                <div>
                  <dt className={mutedFg}>Gender</dt>
                  <dd className="font-medium capitalize text-[var(--color-foreground)]">
                    {patient.gender ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className={mutedFg}>Contact</dt>
                  <dd>
                    <a
                      href={`tel:${patient.phone}`}
                      className="focus-ring font-medium text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline"
                    >
                      {patient.phone ?? "—"}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className={mutedFg}>Location</dt>
                  <dd className="truncate font-medium text-[var(--color-foreground)]">
                    {[patient.city, patient.state].filter(Boolean).join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={mutedFg}>Registered</dt>
                  <dd className={fgMedium}>
                    {formatDate(patient.created_at)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <PatientViewButton patient={patient} myRole={myRole} />
              </div>
            </div>
          ))}
        </div>
      )}

      {patients.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)] md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className={tableHeadCell}>
                  <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Number</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Date of birth</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Registered</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className={divideBorder}>
                {patients.map((patient) => (
                  <tr key={patient.id} className="transition-colors duration-150 hover:bg-[var(--color-muted)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${patientGradient(patient.id)} text-xs font-bold text-white shadow-sm ring-2 ring-white`}
                        >
                          {patientInitials(patient.first_name, patient.last_name)}
                        </span>
                        <div className="min-w-0">
                          <p className={fgMedium}>
                            {patient.last_name}, {patient.first_name}
                          </p>
                          <p className="text-xs capitalize text-[var(--color-muted-fg)]">
                            {patient.gender ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-primary-dark)]">
                      {patient.patient_number}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-fg)]">
                      {formatDate(patient.date_of_birth)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`tel:${patient.phone}`}
                        className="focus-ring text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline"
                      >
                        {patient.phone ?? "—"}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-fg)]">
                      {[patient.city, patient.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-fg)]">
                      {formatDate(patient.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={patient.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PatientViewButton patient={patient} myRole={myRole} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
