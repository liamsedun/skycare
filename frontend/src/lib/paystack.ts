// ============================================================================
// PAYSTACK — hand-rolled fetch client with per-tenant keys.
// Keys live in tenants.settings.paystack JSONB { publicKey, secretKey,
// webhookSecret } with env fallback (PAYSTACK_SECRET_KEY / PAYSTACK_WEBHOOK_SECRET).
// Docs: https://paystack.com/docs/api
// ============================================================================

import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "https://api.paystack.co";

export interface PaystackKeys {
  publicKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  /** true when a real (non-placeholder) secret key is available */
  configured: boolean;
  /** where secretKey came from — "tenant" | "env" | null */
  source: "tenant" | "env" | null;
}

/**
 * Placeholder detection — prevents the flow from ever calling Paystack with a
 * junk key. A key counts as real when it matches a Paystack secret (sk_live_/
 * sk_test_ with a long nonce) or the webhook secret (a long SHA hash / hex);
 * everything else (empty, "PAYSTACK_SECRET_KEY", "placeholder-…", env names)
 * is treated as unconfigured and the route degrades to offline payments.
 */
export function isPlaceholderKey(key: string | null | undefined): boolean {
  if (!key) return true;
  if (key.length < 15) return true;
  if (key.startsWith("placeholder")) return true;
  if (key.includes("PAYSTACK_SECRET_KEY") || key.startsWith("${")) return true;
  // Real Paystack secret keys carry sk_live_/sk_test_ prefixes.
  if (key.startsWith("sk_live_") || key.startsWith("sk_test_")) return false;
  // Webhook secret: 32+ hex chars or a long opaque string
  if (/^[0-9a-fA-F]{32,}$/.test(key)) return false;
  return key.includes(" ") ? true : key.length < 24;
}

/**
 * Resolve a tenant's Paystack keys: tenant settings first, env as fallback.
 * Secret values never leave the server through public routes.
 */
export async function getPaystackKeys(
  svc: SupabaseClient,
  tenantId: string
): Promise<PaystackKeys> {
  let tenant: { publicKey: string | null; secretKey: string | null; webhookSecret: string | null } | null = null;
  try {
    const { data } = await svc
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .maybeSingle();
    const ps = (data?.settings as Record<string, any>)?.paystack;
    if (ps && typeof ps === "object") {
      tenant = {
        publicKey: typeof ps.publicKey === "string" ? ps.publicKey : null,
        secretKey: typeof ps.secretKey === "string" ? ps.secretKey : null,
        webhookSecret: typeof ps.webhookSecret === "string" ? ps.webhookSecret : null,
      };
    }
  } catch {
    /* fall through to env */
  }

  const envSecret = process.env.PAYSTACK_SECRET_KEY ?? null;
  const envWebhook = process.env.PAYSTACK_WEBHOOK_SECRET ?? null;
  const envPublic = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? process.env.PAYSTACK_PUBLIC_KEY ?? null;

  const secretKey = tenant?.secretKey || envSecret;
  const webhookSecret = tenant?.webhookSecret || envWebhook;
  const publicKey = tenant?.publicKey || envPublic;

  const configured = !isPlaceholderKey(secretKey);
  const source: PaystackKeys["source"] = tenant?.secretKey ? "tenant" : envSecret ? "env" : null;

  return { publicKey, secretKey, webhookSecret, configured, source };
}

/** Mask a key for admin UI display (last 4 chars only). */
export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••••${key.slice(-4)}`;
}

async function post<T>(path: string, body: Record<string, unknown>, secretKey: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || "Paystack API error");
  return json.data as T;
}

async function get<T>(path: string, secretKey: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || "Paystack API error");
  return json.data as T;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InitResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyResponse {
  id: number;
  status: "success" | "failed" | "abandoned" | "pending";
  reference: string;
  amount: number; // in kobo
  channel: string; // "card" | "bank" | "ussd" | "qr" | "mobile_money" | "bank_transfer"
  currency: string;
  paid_at: string;
  created_at: string;
  customer: { email: string; id: number };
  authorization: Record<string, any>;
  metadata: Record<string, any>;
  fees: number;
  paidAt: string;
}

export interface WebhookEvent {
  event: "charge.success" | "charge.failed" | "transfer.success" | "transfer.failed";
  data: {
    id: number;
    reference: string;
    status: string;
    amount: number; // kobo
    channel: string;
    currency: string;
    paid_at: string;
    customer: { email: string };
    metadata: Record<string, any>;
    authorization: Record<string, any>;
    fees?: number;
  };
}

// ─── API methods ─────────────────────────────────────────────────────────────

/**
 * Initialize a transaction. `amount` in kobo. Metadata must include
 * { invoice_id, patient_id, tenant_id, invoice_number } so the webhook can
 * resolve which tenant's keys to verify with.
 */
export async function initializeTransaction(opts: {
  secretKey: string;
  email: string;
  amountKobo: number;
  reference?: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
}): Promise<InitResponse> {
  return post(
    "/transaction/initialize",
    {
      email: opts.email,
      amount: opts.amountKobo,
      reference: opts.reference,
      metadata: opts.metadata || {},
      callback_url: opts.callbackUrl,
    },
    opts.secretKey
  );
}

/** Verify a transaction by reference. */
export async function verifyTransaction(reference: string, secretKey: string): Promise<VerifyResponse> {
  return get(`/transaction/verify/${encodeURIComponent(reference)}`, secretKey);
}

/** Constant-time HMAC-SHA512 webhook signature check. */
export function verifyWebhookSignature(
  body: string,
  signature: string | null | undefined,
  webhookSecret: string | null | undefined
): boolean {
  if (!signature || !webhookSecret) return false;
  const hash = createHmac("sha512", webhookSecret).update(body).digest("hex");
  try {
    const a = Buffer.from(hash, "utf8");
    const b = Buffer.from(signature, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Deterministic reference unique per tenant (payments.reference has a partial unique index). */
export function generateReference(tenantId: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SC-${tenantId.slice(0, 8).toUpperCase()}-${rand}`;
}
