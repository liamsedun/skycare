import { describe, expect, it } from "vitest";
import { resolveEffectivePrices } from "@/lib/pharmacy-pricing";

function thenable(payload: unknown) {
  const chain = {
    then: (res: (v: unknown) => void) => Promise.resolve(payload).then(res),
    catch: undefined,
    finally: undefined,
  };
  for (const m of ["select", "eq", "in", "maybeSingle", "count"]) {
    (chain as Record<string, unknown>)[m] = () => chain;
  }
  return chain as unknown as Promise<typeof payload>;
}

function svcStub(
  overrides: Array<{ drug_id: string; branch_id: string | null; unit_price: number }>,
  drugs: Array<{ id: string; unit_price: number; wholesale_price: number }>
) {
  return {
    from: (table: string) => {
      const payload = table === "pharmacy_price_overrides" ? overrides : drugs;
      return thenable({ data: payload ?? null, error: null });
    },
  };
}

describe("resolveEffectivePrices", () => {
  it("returns an empty map for no ids", async () => {
    const result = await resolveEffectivePrices(svcStub([], []) as never, "t1", null, []);
    expect(result.size).toBe(0);
  });

  it("prefers the branch override over the base override", async () => {
    const result = await resolveEffectivePrices(
      svcStub(
        [
          { drug_id: "d1", branch_id: "b1", unit_price: 100 },
          { drug_id: "d1", branch_id: null, unit_price: 90 },
        ],
        [{ id: "d1", unit_price: 50, wholesale_price: 40 }]
      ) as never,
      "t1",
      "b1",
      ["d1"]
    );
    expect(result.get("d1")).toEqual({ price: 100, source: "branch_override" });
  });

  it("ignores branch overrides for other branches and falls to base override", async () => {
    const result = await resolveEffectivePrices(
      svcStub(
        [
          { drug_id: "d1", branch_id: "b2", unit_price: 100 },
          { drug_id: "d1", branch_id: null, unit_price: 90 },
        ],
        [{ id: "d1", unit_price: 50, wholesale_price: 40 }]
      ) as never,
      "t1",
      "b1",
      ["d1"]
    );
    expect(result.get("d1")).toEqual({ price: 90, source: "base_override" });
  });

  it("falls back to the catalogue unit price", async () => {
    const result = await resolveEffectivePrices(
      svcStub(
        [],
        [{ id: "d1", unit_price: 500, wholesale_price: 300 }]
      ) as never,
      "t1",
      null,
      ["d1"]
    );
    expect(result.get("d1")).toEqual({ price: 500, source: "catalog" });
  });

  it("uses wholesale when the catalogue price is zero", async () => {
    const result = await resolveEffectivePrices(
      svcStub(
        [],
        [{ id: "d1", unit_price: 0, wholesale_price: 300 }]
      ) as never,
      "t1",
      null,
      ["d1"]
    );
    expect(result.get("d1")).toEqual({ price: 300, source: "wholesale" });
  });

  it("yields a zero price for unknown drugs", async () => {
    const result = await resolveEffectivePrices(svcStub([], []) as never, "t1", null, ["ghost"]);
    expect(result.get("ghost")).toEqual({ price: 0, source: "catalog" });
  });

  it("dedupes ids and resolves every requested drug", async () => {
    const result = await resolveEffectivePrices(
      svcStub(
        [],
        [
          { id: "d1", unit_price: 10, wholesale_price: 5 },
          { id: "d2", unit_price: 0, wholesale_price: 6 },
        ]
      ) as never,
      "t1",
      null,
      ["d1", "d1", "d2"]
    );
    expect(result.size).toBe(2);
    expect(result.get("d1")?.source).toBe("catalog");
    expect(result.get("d2")?.source).toBe("wholesale");
  });

  it("throws when the lookup fails", async () => {
    const bad = { from: () => thenable({ data: null, error: { message: "boom" } }) };
    await expect(resolveEffectivePrices(bad as never, "t1", null, ["d1"])).rejects.toThrow("boom");
  });
});