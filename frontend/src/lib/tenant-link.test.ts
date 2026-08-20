// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { tenantHomeUrl } from "@/lib/tenant-link";

function withLocation(url: string, fn: () => void) {
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url) as unknown as Location,
  });
  try {
    fn();
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

import { vi } from "vitest";

describe("tenantHomeUrl", () => {
  it("links a slug on the production root domain over https", () => {
    withLocation("https://skycare.app/app", () => {
      expect(tenantHomeUrl("liamsfields")).toBe("https://liamsfields.skycare.app/");
    });
    withLocation("https://liamsfields.skycare.app/login", () => {
      expect(tenantHomeUrl("liamsfields")).toBe("https://liamsfields.skycare.app/");
    });
  });

  it("links the local test domain with the current port", () => {
    withLocation("http://skycare.test:3000/app", () => {
      expect(tenantHomeUrl("liamsfields")).toBe("http://liamsfields.skycare.test:3000/");
    });
  });

  it("falls back to the local domain without a port for arbitrary hosts", () => {
    withLocation("http://localhost:3000/", () => {
      expect(tenantHomeUrl("liamsfields")).toBe("http://liamsfields.skycare.test:3000/");
    });
  });
});