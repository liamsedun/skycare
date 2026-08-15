"use client";

import type { TenantBranding } from "@/lib/use-tenant-branding";

/** Single-line org address: "street, city, state, country" (missing parts skipped). */
export function fullAddress(
  brand: Pick<TenantBranding, "address" | "city" | "state" | "country"> | null | undefined
): string {
  if (!brand) return "";
  const cityState = [brand.city, brand.state].filter(Boolean).join(", ");
  return [brand.address, cityState, brand.country].filter(Boolean).join(", ");
}

/** "Tel: … • Email: … • Website: …" contact line for print letterheads. */
export function contactLine(brand: TenantBranding | null | undefined): string {
  if (!brand) return "";
  return [
    brand.phone && `Tel: ${brand.phone}`,
    brand.email && `Email: ${brand.email}`,
    brand.website,
  ]
    .filter(Boolean)
    .join(" • ");
}

/**
 * Tenant letterhead shown on printed bills/invoices/receipts: logo (or initial
 * fallback), hospital name, address and contact line. Renders nothing when no
 * branding has loaded yet so documents never flash an empty header.
 */
export default function TenantLetterhead({ brand }: { brand: TenantBranding | null }) {
  if (!brand) return null;
  const name = brand.name || "SkyCare HMS";

  return (
    <div className="flex flex-wrap items-start gap-4 border-b border-[var(--color-border)] px-6 py-5">
      {brand.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_url} alt={`${name} logo`} className="max-h-14 w-auto max-w-28 shrink-0 object-contain" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-xl font-bold text-[var(--color-primary-dark)]">
          {(name.trim()[0] ?? "S").toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-base font-bold leading-snug text-[var(--color-foreground)]">{name}</p>
        {fullAddress(brand) && <p className="mt-0.5 text-xs text-[var(--color-muted-fg)]">{fullAddress(brand)}</p>}
        {contactLine(brand) && <p className="mt-1 text-xs text-[var(--color-muted-fg)]">{contactLine(brand)}</p>}
      </div>
    </div>
  );
}