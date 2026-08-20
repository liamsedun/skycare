import { describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import {
  generateReference,
  getPaystackKeys,
  initializeTransaction,
  isPlaceholderKey,
  maskKey,
  verifyTransaction,
  verifyWebhookSignature,
} from "@/lib/paystack";

describe("isPlaceholderKey", () => {
  it("flags empty and short keys", () => {
    expect(isPlaceholderKey(null)).toBe(true);
    expect(isPlaceholderKey(undefined)).toBe(true);
    expect(isPlaceholderKey("")).toBe(true);
    expect(isPlaceholderKey("sk_short")).toBe(true);
  });

  it("flags placeholder markers and env-name leftovers", () => {
    expect(isPlaceholderKey("placeholder")).toBe(true);
    expect(isPlaceholderKey("PAYSTACK_SECRET_KEY")).toBe(true);
    expect(isPlaceholderKey("${PAYSTACK_SECRET_KEY}")).toBe(true);
  });

  it("accepts real paystack secrets and webhook secrets", () => {
    expect(isPlaceholderKey("sk_test_12345678901234567890abc")).toBe(false);
    const liveLike = "sk_live_" + "12345678901234567890abcdef";
    expect(isPlaceholderKey(liveLike)).toBe(false);
    expect(isPlaceholderKey("0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("rejects long junk that is not a known shape", () => {
    expect(isPlaceholderKey("a b c d e f g h i j k l m n o p q r s t u v w x")).toBe(true);
  });
});

describe("maskKey", () => {
  it("masks to the last 4 characters", () => {
    expect(maskKey("sk_test_abc12345")).toBe("••••••2345");
  });

  it("handles null and tiny keys", () => {
    expect(maskKey(null)).toBeNull();
    expect(maskKey("ab")).toBe("••••");
  });
});

describe("generateReference", () => {
  it("builds SC-<tenant8>-<rand> with an upper-cased tenant slice", () => {
    const ref = generateReference("b9290c07-456f-4951-ae86-37a64dacc486");
    expect(ref).toMatch(/^SC-B9290C07-[A-Z0-9]{8}$/);
  });

  it("produces distinct references", () => {
    const a = generateReference("t1");
    const b = generateReference("t1");
    expect(a).not.toBe(b);
  });
});

describe("verifyWebhookSignature", () => {
  it("validates an HMAC-SHA512 signature and rejects bad ones", () => {
    const body = '{"event":"charge.success"}';
    const secret = "whsec_0123456789abcdef0123456789abcdef";
    const good = createHmac("sha512", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, good, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, good, null)).toBe(false);
  });
});

describe("getPaystackKeys", () => {
  const sk = "sk_test_12345678901234567890abc";
  const wh = "0123456789abcdef0123456789abcdef";

  it("reads tenant keys and marks source=tenant", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: { paystack: { publicKey: "pk_test_x", secretKey: sk, webhookSecret: wh } } },
            }),
          }),
        }),
      }),
    };
    const keys = await getPaystackKeys(svc as never, "t1");
    expect(keys.secretKey).toBe(sk);
    expect(keys.webhookSecret).toBe(wh);
    expect(keys.publicKey).toBe("pk_test_x");
    expect(keys.configured).toBe(true);
    expect(keys.source).toBe("tenant");
  });

  it("falls back to env keys on missing tenant settings", async () => {
    const svc = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
    vi.stubEnv("PAYSTACK_SECRET_KEY", sk);
    vi.stubEnv("PAYSTACK_WEBHOOK_SECRET", wh);
    const keys = await getPaystackKeys(svc as never, "t1");
    expect(keys.configured).toBe(true);
    expect(keys.source).toBe("env");
    vi.unstubAllEnvs();
  });

  it("reports unconfigured when keys are placeholders", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: { paystack: { publicKey: null, secretKey: "placeholder", webhookSecret: null } } },
            }),
          }),
        }),
      }),
    };
    const keys = await getPaystackKeys(svc as never, "t1");
    expect(keys.configured).toBe(false);
    expect(keys.source).toBe("tenant");
  });
});

describe("Paystack HTTP calls", () => {
  it("initializeTransaction POSTs and unwraps data; errors on status=false", async () => {
    const payload = { status: true, data: { authorization_url: "https://pay", access_code: "ac", reference: "SC-1" } };
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      json: async () => payload,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await initializeTransaction({
      secretKey: "sk_test_x",
      email: "a@b.c",
      amountKobo: 500000,
      reference: "SC-1",
      callbackUrl: "https://app/cb",
    });
    expect(out).toEqual(payload.data);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.paystack.co/transaction/initialize");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_x");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ status: false, message: "Invalid key" }) }))
    );
    await expect(
      initializeTransaction({ secretKey: "bad", email: "a@b.c", amountKobo: 1 })
    ).rejects.toThrow("Invalid key");
  });

  it("verifyTransaction GETs and unwraps", async () => {
    const payload = { status: true, data: { id: 1, status: "success", reference: "SC-1" } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => payload })));
    const out = await verifyTransaction("SC-1", "sk_test_x");
    expect(out).toEqual(payload.data);
  });
});