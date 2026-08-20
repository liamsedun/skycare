import { describe, expect, it } from "vitest";
import {
  ApiError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getPagination,
  ok,
  okPaginated,
  err,
  parseBody,
  resolveParam,
  sanitizeLike,
} from "@/lib/api-utils";

describe("error family", () => {
  it("ApiError carries a status", () => {
    const e = new ApiError("boom", 418);
    expect(e.message).toBe("boom");
    expect(e.status).toBe(418);
  });

  it("specialised errors carry their statuses", () => {
    expect(new AuthError().status).toBe(401);
    expect(new AuthError("nope").message).toBe("nope");
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ValidationError().status).toBe(400);
    expect(new ValidationError("bad").message).toBe("bad");
  });
});

describe("getPagination", () => {
  it("defaults to page 1 / size 20 with inclusive range", () => {
    expect(getPagination(new URLSearchParams())).toEqual({ page: 1, pageSize: 20, from: 0, to: 19 });
  });

  it("parses provided values and floors fractions", () => {
    const p = getPagination(new URLSearchParams("page=3&pageSize=25"));
    expect(p.page).toBe(3);
    expect(p.pageSize).toBe(25);
    expect(p.from).toBe(50);
    expect(p.to).toBe(74);
  });

  it("clamps size to 100 and falls back on garbage", () => {
    expect(getPagination(new URLSearchParams("page=a&pageSize=999")).pageSize).toBe(100);
    expect(getPagination(new URLSearchParams("page=0&pageSize=0")).page).toBe(1);
    expect(getPagination(new URLSearchParams("page=-2&pageSize=-5")).pageSize).toBe(20);
  });
});

describe("resolveParam", () => {
  it("unwraps arrays and nullish values", () => {
    expect(resolveParam("x")).toBe("x");
    expect(resolveParam(["a", "b"])).toBe("a");
    expect(resolveParam([])).toBeNull();
    expect(resolveParam(null)).toBeNull();
    expect(resolveParam(undefined)).toBeNull();
  });
});

describe("sanitizeLike", () => {
  it("replaces parens and commas with wildcards", () => {
    expect(sanitizeLike("Bisoprolol (Sandoz) 5mg")).toBe("Bisoprolol %Sandoz% 5mg");
    expect(sanitizeLike("plain")).toBe("plain");
  });
});

describe("response envelopes", () => {
  it("ok wraps data with { success-less } envelope (legacy shape)", async () => {
    const res = ok({ id: 1 }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: 1 } });
  });

  it("err returns an error envelope", async () => {
    const res = err("nope", 400);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "nope" });
  });

  it("okPaginated computes totalPages", async () => {
    const res = okPaginated([1, 2, 3], 25, 2, 10);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [1, 2, 3],
      meta: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
    });
  });
});

describe("parseBody", () => {
  it("parses JSON bodies", async () => {
    const req = new Request("http://x", { method: "POST", body: '{"a":1}' });
    expect(await parseBody(req as never)).toEqual({ a: 1 });
  });

  it("throws a ValidationError on invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "not json" });
    await expect(parseBody(req as never)).rejects.toBeInstanceOf(ValidationError);
  });
});