import { describe, expect, it } from "vitest";
import { cookieDomainForHost, hasParentDomain } from "@/lib/cookie-domain";

describe("cookieDomainForHost", () => {
  it("returns the parent domain for tenant subdomains", () => {
    expect(cookieDomainForHost("liamsfields.skycare.app")).toBe("skycare.app");
    expect(cookieDomainForHost("liamsfields.skycare.test")).toBe("skycare.test");
  });

  it("strips scheme and port before matching", () => {
    expect(cookieDomainForHost("https://liamsfields.skycare.app:3000")).toBe("skycare.app");
    expect(cookieDomainForHost("http://liamsfields.skycare.test")).toBe("skycare.test");
  });

  it("is case-insensitive", () => {
    expect(cookieDomainForHost("LIAMSFIELDS.SKYCARE.APP")).toBe("skycare.app");
  });

  it("returns undefined for the bare root, IPs, localhost and other hosts", () => {
    expect(cookieDomainForHost("skycare.app")).toBeUndefined();
    expect(cookieDomainForHost("localhost:3000")).toBeUndefined();
    expect(cookieDomainForHost("127.0.0.1:3000")).toBeUndefined();
    expect(cookieDomainForHost("example.com")).toBeUndefined();
    expect(cookieDomainForHost(null)).toBeUndefined();
    expect(cookieDomainForHost("")).toBeUndefined();
  });
});

describe("hasParentDomain", () => {
  it("is true only when a parent domain resolves", () => {
    expect(hasParentDomain("liamsfields.skycare.app")).toBe(true);
    expect(hasParentDomain("skycare.app")).toBe(false);
    expect(hasParentDomain(undefined)).toBe(false);
  });
});