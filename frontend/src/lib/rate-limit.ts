import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// RATE LIMITER — In-memory sliding-window rate limiting for API routes.
// This is a SECOND layer behind the WAF/CDN (Cloudflare, Netlify Edge).
// Designed for Node.js single-process; survives across requests within the
// same server instance. Not shared across instances — use Redis for that.
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  /** Maximum requests allowed per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional: key derivation function. Defaults to IP-based. */
  keyFn?: (req: NextRequest) => string;
  /** Response message when rate limited. */
  message?: string;
  /** HTTP status code when rate limited. */
  status?: number;
  /** Headers to include in the response. */
  headers?: boolean;
}

// Global store — scoped to this process. WeakRef not needed; entries are small.
const store = new Map<string, RateLimitEntry>();

// Periodic cleanup every 5 minutes to prevent memory leaks from stale entries.
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now - entry.windowStart > entry.windowStart + 60_000) {
      store.delete(key);
    }
  }
}

/** Extract client IP from request headers. */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Build a composite key from IP + optional extra dimensions. */
export function compositeKey(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(":");
}

/**
 * Core rate-limit check. Returns { allowed, remaining, resetMs }.
 * If allowed is false, the caller should return a 429 response.
 */
function checkLimit(key: string, config: RateLimitConfig): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  total: number;
} {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.maxRequests - 1, resetMs: config.windowMs, total: config.maxRequests };
  }

  // Same window
  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetMs = config.windowMs - (now - entry.windowStart);

  return { allowed: entry.count <= config.maxRequests, remaining, resetMs, total: config.maxRequests };
}

/**
 * Rate-limit middleware wrapper for API route handlers.
 *
 * @example
 * ```ts
 * export const POST = rateLimit(
 *   async (req) => { ... },
 *   { maxRequests: 10, windowMs: 60_000 }
 * );
 * ```
 */
export function rateLimit(
  handler: (req: NextRequest, ctx?: unknown) => Promise<NextResponse> | NextResponse,
  config: RateLimitConfig
) {
  return async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    const key = config.keyFn ? config.keyFn(req) : getClientIp(req);
    const { allowed, remaining, resetMs, total } = checkLimit(key, config);

    if (!allowed) {
      const retryAfter = Math.ceil(resetMs / 1000);
      const response = NextResponse.json(
        { error: config.message ?? "Too many requests. Please try again later." },
        { status: config.status ?? 429 }
      );
      response.headers.set("Retry-After", String(retryAfter));
      response.headers.set("X-RateLimit-Limit", String(total));
      response.headers.set("X-RateLimit-Remaining", "0");
      response.headers.set("X-RateLimit-Reset", String(Math.ceil((Date.now() + resetMs) / 1000)));
      return response;
    }

    const response = await handler(req, ctx);

    if (config.headers !== false) {
      response.headers.set("X-RateLimit-Limit", String(total));
      response.headers.set("X-RateLimit-Remaining", String(remaining));
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// PRESET CONFIGURATIONS
// ---------------------------------------------------------------------------

/** Standard API rate limit: 100 req/min per IP. */
export const API_STANDARD = { maxRequests: 100, windowMs: 60_000 };

/** Strict auth rate limit: 10 req/min per IP (login, password reset). */
export const API_AUTH_STRICT = { maxRequests: 10, windowMs: 60_000 };

/** Identifier resolution: 20 req/min per IP (prevents enumeration). */
export const API_IDENTIFIER = { maxRequests: 20, windowMs: 60_000 };

/** File upload: 10 req/min per IP. */
export const API_UPLOAD = { maxRequests: 10, windowMs: 60_000 };

/** Payment endpoints: 20 req/min per IP. */
export const API_PAYMENT = { maxRequests: 20, windowMs: 60_000 };

/** Admin endpoints: 60 req/min per IP. */
export const API_ADMIN = { maxRequests: 60, windowMs: 60_000 };

/** Webhook: 100 req/min per IP (Paystack sends multiple events). */
export const API_WEBHOOK = { maxRequests: 100, windowMs: 60_000 };

/** Patient portal: 60 req/min per IP. */
export const API_PATIENT = { maxRequests: 60, windowMs: 60_000 };

/** Tenant-aware key: combines IP + tenant slug. */
export function tenantKey(req: NextRequest, tenantId?: string | null): string {
  return compositeKey(getClientIp(req), tenantId ?? "global");
}

/** Auth-aware key: combines IP + user identifier. */
export function authKey(req: NextRequest, identifier?: string): string {
  return compositeKey(getClientIp(req), identifier ?? "unknown");
}

// ---------------------------------------------------------------------------
// LOGIN LOCKOUT — Wire the dead checkLoginLockout into the login flow.
// Uses the same in-memory store with a stricter policy.
// ---------------------------------------------------------------------------

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const lockoutStore = new Map<string, { failures: number; firstFailure: number; lockedUntil?: number }>();

/**
 * Check if an identifier+IP combination is currently locked out.
 * Returns { locked, retryMs } — if locked, the caller should return 429.
 */
export function checkLockout(
  identifier: string,
  ip: string
): { locked: boolean; retryMs: number } {
  const key = compositeKey(identifier, ip);
  const entry = lockoutStore.get(key);
  const now = Date.now();

  if (!entry) return { locked: false, retryMs: 0 };

  // Lockout period expired
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    lockoutStore.delete(key);
    return { locked: false, retryMs: 0 };
  }

  // Currently locked
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { locked: true, retryMs: entry.lockedUntil - now };
  }

  // Window expired
  if (now - entry.firstFailure >= LOCKOUT_WINDOW_MS) {
    lockoutStore.delete(key);
    return { locked: false, retryMs: 0 };
  }

  // Under threshold
  if (entry.failures < LOCKOUT_THRESHOLD) {
    return { locked: false, retryMs: 0 };
  }

  // Threshold reached — lock for remaining window
  entry.lockedUntil = entry.firstFailure + LOCKOUT_WINDOW_MS;
  return { locked: true, retryMs: entry.lockedUntil - now };
}

/**
 * Record a failed login attempt. Returns { locked, retryMs } after recording.
 */
export function recordFailure(
  identifier: string,
  ip: string
): { locked: boolean; retryMs: number } {
  const key = compositeKey(identifier, ip);
  const now = Date.now();
  const entry = lockoutStore.get(key);

  if (!entry || now - entry.firstFailure >= LOCKOUT_WINDOW_MS) {
    lockoutStore.set(key, { failures: 1, firstFailure: now });
    return { locked: false, retryMs: 0 };
  }

  entry.failures++;

  if (entry.failures >= LOCKOUT_THRESHOLD) {
    entry.lockedUntil = entry.firstFailure + LOCKOUT_WINDOW_MS;
    return { locked: true, retryMs: entry.lockedUntil - now };
  }

  return { locked: false, retryMs: 0 };
}

/** Reset lockout after a successful login. */
export function resetLockout(identifier: string, ip: string): void {
  const key = compositeKey(identifier, ip);
  lockoutStore.delete(key);
}

// ---------------------------------------------------------------------------
// ABUSE DETECTION — Progressive escalation based on request frequency.
// ---------------------------------------------------------------------------

const abuseStore = new Map<string, { count: number; windowStart: number; level: number }>();

export type AbuseLevel = "normal" | "suspicious" | "highly_suspicious" | "attack";

const ABUSE_THRESHOLDS = {
  suspicious: 50,          // 50 req/min → suspicious
  highly_suspicious: 200,  // 200 req/min → highly suspicious
  attack: 1000,            // 1000 req/min → attack pattern
} as const;

/**
 * Classify a client's request frequency. Returns the abuse level
 * and recommended action.
 */
export function classifyAbuse(req: NextRequest): {
  level: AbuseLevel;
  action: "allow" | "throttle" | "challenge" | "block";
  count: number;
} {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = abuseStore.get(ip);

  if (!entry || now - entry.windowStart >= 60_000) {
    abuseStore.set(ip, { count: 1, windowStart: now, level: 0 });
    return { level: "normal", action: "allow", count: 1 };
  }

  entry.count++;

  if (entry.count >= ABUSE_THRESHOLDS.attack) {
    return { level: "attack", action: "block", count: entry.count };
  }
  if (entry.count >= ABUSE_THRESHOLDS.highly_suspicious) {
    return { level: "highly_suspicious", action: "challenge", count: entry.count };
  }
  if (entry.count >= ABUSE_THRESHOLDS.suspicious) {
    return { level: "suspicious", action: "throttle", count: entry.count };
  }

  return { level: "normal", action: "allow", count: entry.count };
}
