import { createServiceClient } from "@/lib/supabase/server";

const SYMBOLS: Record<string, string> = {
  NGN: "₦", USD: "$", GHS: "GH₵", KES: "KSh", ZAR: "R", GBP: "£", EUR: "€",
};

/**
 * Server-side: fetches the tenant's currency from the DB and returns a formatter.
 * Usage in API routes:
 *   const { fmt } = await tenantCurrency(svc, tenantId);
 *   fmt(5000) // "₦5,000" or "$3.33"
 */
export async function tenantCurrency(
  svc: ReturnType<typeof createServiceClient>,
  tenantId: string | null
): Promise<{ currency: string; symbol: string; fmt: (n: number) => string; fmtCompact: (n: number) => string }> {
  let currency = "NGN";
  if (tenantId) {
    try {
      const { data } = await svc
        .from("tenants")
        .select("settings")
        .eq("id", tenantId)
        .single();
      const settings = data?.settings as Record<string, unknown> | null;
      if (settings?.currency && typeof settings.currency === "string") {
        currency = settings.currency.toUpperCase();
      }
    } catch {
      // fallback to NGN
    }
  }
  const symbol = SYMBOLS[currency] || "$";

  function fmt(n: number | null | undefined): string {
    const v = Number(n ?? 0);
    if (currency === "NGN") {
      return new Intl.NumberFormat("en-NG", {
        style: "currency", currency: "NGN", maximumFractionDigits: 0,
      }).format(v);
    }
    return new Intl.NumberFormat("en", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(v);
  }

  function fmtCompact(n: number | null | undefined): string {
    const v = Number(n ?? 0);
    if (Math.abs(v) >= 1e9) return `${symbol}${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `${symbol}${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${symbol}${(v / 1e3).toFixed(0)}K`;
    return fmt(v);
  }

  return { currency, symbol, fmt, fmtCompact };
}

/**
 * Quick symbol-only lookup (no DB call) — use when you only need the symbol.
 */
export function currencySymbol(currency?: string | null): string {
  return SYMBOLS[(currency || "NGN").toUpperCase()] || "$";
}
