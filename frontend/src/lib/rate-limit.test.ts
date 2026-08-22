import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  getClientIp,
  compositeKey,
  rateLimit,
  tenantKey,
  authKey,
  checkLockout,
  recordFailure,
  resetLockout,
  classifyAbuse,
  API_AUTH_STRICT,
  API_STANDARD,
} from "@/lib/rate-limit";

function fakeRequest(
  headers: Record<string, string> = {},
  url = "http://localhost:3000/api/test"
): NextRequest {
  return new NextRequest(new Request(url, { headers }));
}

describe("getClientIp", () => {
  it("returns x-forwarded-for first value", () => {
    const req = fakeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip", () => {
    const req = fakeRequest({ "x-real-ip": "9.8.7.6" });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });
  it("falls back to cf-connecting-ip", () => {
    const req = fakeRequest({ "cf-connecting-ip": "4.4.4.4" });
    expect(getClientIp(req)).toBe("4.4.4.4");
  });
  it("returns unknown when no headers present", () => {
    expect(getClientIp(fakeRequest())).toBe("unknown");
  });
});

describe("compositeKey", () => {
  it("joins parts with colon", () => {
    expect(compositeKey("a", "b", "c")).toBe("a:b:c");
  });
  it("filters null/undefined/empty", () => {
    expect(compositeKey("a", null, undefined, "", "b")).toBe("a:b");
  });
});

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("allows requests within limit", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, { maxRequests: 3, windowMs: 60_000 });

    const res1 = await limited(fakeRequest({ "x-forwarded-for": "1.1.1.1" }));
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");
  });

  it("blocks after exceeding limit", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, { maxRequests: 2, windowMs: 60_000 });

    await limited(fakeRequest({ "x-forwarded-for": "2.2.2.2" }));
    await limited(fakeRequest({ "x-forwarded-for": "2.2.2.2" }));
    const res = await limited(fakeRequest({ "x-forwarded-for": "2.2.2.2" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("uses custom keyFn", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, {
      maxRequests: 1,
      windowMs: 60_000,
      keyFn: () => "custom-key",
    });

    await limited(fakeRequest({ "x-forwarded-for": "1.1.1.1" }));
    const res = await limited(fakeRequest({ "x-forwarded-for": "2.2.2.2" }));
    // Same custom key → blocked
    expect(res.status).toBe(429);
  });

  it("uses custom message and status", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, {
      maxRequests: 1,
      windowMs: 60_000,
      message: "Slow down",
      status: 503,
    });

    await limited(fakeRequest({ "x-forwarded-for": "custom-msg-ip" }));
    const res = await limited(fakeRequest({ "x-forwarded-for": "custom-msg-ip" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Slow down");
  });

  it("omits rate limit headers when headers=false", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, { maxRequests: 10, windowMs: 60_000, headers: false });

    const res = await limited(fakeRequest());
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeNull();
  });

  it("resets window after expiry", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const limited = rateLimit(handler, { maxRequests: 1, windowMs: 10_000 });

    await limited(fakeRequest({ "x-forwarded-for": "3.3.3.3" }));
    const blocked = await limited(fakeRequest({ "x-forwarded-for": "3.3.3.3" }));
    expect(blocked.status).toBe(429);

    vi.advanceTimersByTime(10_001);
    const res = await limited(fakeRequest({ "x-forwarded-for": "3.3.3.3" }));
    expect(res.status).toBe(200);
  });

  it("passes ctx to handler", async () => {
    const handler = vi.fn(async (_req: NextRequest, ctx: unknown) => {
      return NextResponse.json({ ctx });
    });
    const limited = rateLimit(handler, { maxRequests: 10, windowMs: 60_000 });
    const ctx = { params: { id: "123" } };
    await limited(fakeRequest(), ctx);
    expect(handler).toHaveBeenCalledWith(expect.any(NextRequest), ctx);
  });
});

describe("tenantKey / authKey", () => {
  it("tenantKey combines IP + tenant", () => {
    const req = fakeRequest({ "x-forwarded-for": "1.1.1.1" });
    expect(tenantKey(req, "abc")).toBe("1.1.1.1:abc");
  });
  it("tenantKey uses global when no tenant", () => {
    const req = fakeRequest({ "x-forwarded-for": "1.1.1.1" });
    expect(tenantKey(req)).toBe("1.1.1.1:global");
  });
  it("authKey combines IP + identifier", () => {
    const req = fakeRequest({ "x-forwarded-for": "2.2.2.2" });
    expect(authKey(req, "user@example.com")).toBe("2.2.2.2:user@example.com");
  });
  it("authKey uses unknown when no identifier", () => {
    const req = fakeRequest({ "x-forwarded-for": "2.2.2.2" });
    expect(authKey(req)).toBe("2.2.2.2:unknown");
  });
});

describe("login lockout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetLockout("testuser", "1.1.1.1");
  });

  it("starts unlocked", () => {
    expect(checkLockout("testuser", "1.1.1.1")).toEqual({ locked: false, retryMs: 0 });
  });

  it("locks after 5 failures", () => {
    for (let i = 0; i < 4; i++) {
      const r = recordFailure("testuser", "1.1.1.1");
      expect(r.locked).toBe(false);
    }
    const r = recordFailure("testuser", "1.1.1.1");
    expect(r.locked).toBe(true);
    expect(r.retryMs).toBeGreaterThan(0);
  });

  it("checkLockout returns locked when locked", () => {
    for (let i = 0; i < 5; i++) recordFailure("lockchk", "2.2.2.2");
    const result = checkLockout("lockchk", "2.2.2.2");
    expect(result.locked).toBe(true);
    expect(result.retryMs).toBeGreaterThan(0);
  });

  it("unlocks after resetLockout", () => {
    for (let i = 0; i < 5; i++) recordFailure("resetuser", "3.3.3.3");
    expect(checkLockout("resetuser", "3.3.3.3").locked).toBe(true);
    resetLockout("resetuser", "3.3.3.3");
    expect(checkLockout("resetuser", "3.3.3.3").locked).toBe(false);
  });

  it("resets after window expiry", () => {
    recordFailure("expireuser", "4.4.4.4");
    vi.advanceTimersByTime(16 * 60 * 1000); // 16 min > 15 min window
    expect(checkLockout("expireuser", "4.4.4.4").locked).toBe(false);
  });

  it("unlock after lockout period expires", () => {
    for (let i = 0; i < 5; i++) recordFailure("lockexpire", "5.5.5.5");
    expect(checkLockout("lockexpire", "5.5.5.5").locked).toBe(true);
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(checkLockout("lockexpire", "5.5.5.5").locked).toBe(false);
  });

  it("different IPs are independent", () => {
    for (let i = 0; i < 5; i++) recordFailure("multi", "10.0.0.1");
    expect(checkLockout("multi", "10.0.0.1").locked).toBe(true);
    expect(checkLockout("multi", "10.0.0.2").locked).toBe(false);
  });
});

describe("abuse detection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("returns normal for first request", () => {
    const req = fakeRequest({ "x-forwarded-for": "9.9.9.9" });
    const result = classifyAbuse(req);
    expect(result.level).toBe("normal");
    expect(result.action).toBe("allow");
    expect(result.count).toBe(1);
  });

  it("returns normal below threshold", () => {
    const req = fakeRequest({ "x-forwarded-for": "8.8.8.8" });
    for (let i = 0; i < 10; i++) classifyAbuse(req);
    const result = classifyAbuse(req);
    expect(result.level).toBe("normal");
    expect(result.action).toBe("allow");
  });

  it("returns suspicious at 50 requests", () => {
    const ip = "7.7.7.7";
    const req = fakeRequest({ "x-forwarded-for": ip });
    for (let i = 0; i < 49; i++) classifyAbuse(req);
    const result = classifyAbuse(req);
    expect(result.level).toBe("suspicious");
    expect(result.action).toBe("throttle");
  });

  it("returns highly_suspicious at 200 requests", () => {
    const ip = "6.6.6.6";
    const req = fakeRequest({ "x-forwarded-for": ip });
    for (let i = 0; i < 199; i++) classifyAbuse(req);
    const result = classifyAbuse(req);
    expect(result.level).toBe("highly_suspicious");
    expect(result.action).toBe("challenge");
  });

  it("returns attack at 1000 requests", () => {
    const ip = "5.5.5.5";
    const req = fakeRequest({ "x-forwarded-for": ip });
    for (let i = 0; i < 999; i++) classifyAbuse(req);
    const result = classifyAbuse(req);
    expect(result.level).toBe("attack");
    expect(result.action).toBe("block");
  });

  it("resets after window expiry", () => {
    const ip = "4.4.4.4";
    const req = fakeRequest({ "x-forwarded-for": ip });
    for (let i = 0; i < 60; i++) classifyAbuse(req);
    vi.advanceTimersByTime(60_001);
    const result = classifyAbuse(req);
    expect(result.level).toBe("normal");
    expect(result.count).toBe(1);
  });
});

describe("preset configs", () => {
  it("API_AUTH_STRICT has correct values", () => {
    expect(API_AUTH_STRICT.maxRequests).toBe(10);
    expect(API_AUTH_STRICT.windowMs).toBe(60_000);
  });
  it("API_STANDARD has correct values", () => {
    expect(API_STANDARD.maxRequests).toBe(100);
    expect(API_STANDARD.windowMs).toBe(60_000);
  });
});
