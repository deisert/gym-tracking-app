import { describe, expect, it } from "vitest";
import { magicLinkWillStrand } from "./pwa";

describe("magicLinkWillStrand", () => {
  it("strands the user inside an installed iOS app", () => {
    expect(magicLinkWillStrand({ isIOS: true, isStandalone: true })).toBe(true);
  });

  it("is fine in mobile Safari, where the redirect lands in the same browser", () => {
    expect(magicLinkWillStrand({ isIOS: true, isStandalone: false })).toBe(false);
  });

  it("is fine in an installed non-iOS app, which shares its cookie jar", () => {
    expect(magicLinkWillStrand({ isIOS: false, isStandalone: true })).toBe(false);
  });

  it("is fine on the desktop web", () => {
    expect(magicLinkWillStrand({ isIOS: false, isStandalone: false })).toBe(false);
  });
});
