"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* ── Currency symbol map ── */
const SYMBOLS: Record<string, string> = {
  NGN: "₦", USD: "$", GHS: "GH₵", KES: "KSh", ZAR: "R", GBP: "£", EUR: "€",
};

export const SUPPORTED_CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/* ── Module-level currency variable (set by CurrencyProvider) ── */
let _tenantCurrency = "NGN";

/** Returns the current tenant currency (set by CurrencyProvider on mount). */
export function getTenantCurrency(): string {
  return _tenantCurrency;
}

/* ── Core formatter ── */
export function formatCurrency(amount: number | null | undefined, currency?: string | null): string {
  const cur = (currency || _tenantCurrency || "NGN").toUpperCase();
  const n = Number(amount ?? 0);
  if (cur === "NGN") {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  }
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Returns just the symbol for a currency code */
export function currencySymbol(currency?: string | null): string {
  return SYMBOLS[(currency || "NGN").toUpperCase()] || "$";
}

/** Short compact format: ₦1.2M, $50K */
export function formatCurrencyCompact(amount: number | null | undefined, currency?: string | null): string {
  const cur = (currency || _tenantCurrency || "NGN").toUpperCase();
  const n = Number(amount ?? 0);
  const sym = currencySymbol(cur);
  if (Math.abs(n) >= 1e9) return `${sym}${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${sym}${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${sym}${(n / 1e3).toFixed(0)}K`;
  return formatCurrency(n, cur);
}

/* ── React Context ── */
interface CurrencyCtx {
  currency: string;
  setCurrency: (c: string) => void;
}

const CurrencyContext = createContext<CurrencyCtx>({ currency: "NGN", setCurrency: () => {} });

export function CurrencyProvider({ children, initial }: { children: ReactNode; initial?: string }) {
  const [currency, setCurrency] = useState(initial || "NGN");

  useEffect(() => {
    fetch("/api/tenant/branding", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (body?.data?.currency) setCurrency(body.data.currency);
      })
      .catch(() => {});
  }, []);

  // Sync module-level variable so ng n() callers get the right currency
  useEffect(() => {
    _tenantCurrency = currency;
  }, [currency]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyCtx {
  return useContext(CurrencyContext);
}
