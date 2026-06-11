import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isMainCheckout } from "@/git/root";
import { arbitraryNonBareLinkedFacts, arbitraryPoolFactsSample } from "@testing/generators/main-checkout/main-checkout";

describe("isMainCheckout — bare-pool two-signal mapping", () => {
  it("identifies the main checkout only when the repository-name basename and sibling placement agree and origin resolves", () => {
    fc.assert(
      fc.property(arbitraryPoolFactsSample(), (sample) => {
        expect(isMainCheckout(sample.mainCheckout)).toBe(true);
        expect(isMainCheckout(sample.basenameMismatch)).toBe(false);
        expect(isMainCheckout(sample.siblingMismatch)).toBe(false);
        expect(isMainCheckout(sample.originUnset)).toBe(false);
      }),
    );
  });

  it("does not identify a non-bare repository's linked worktree as the main checkout, even when its name matches the bare-pool rule", () => {
    fc.assert(
      fc.property(arbitraryNonBareLinkedFacts(), (facts) => {
        expect(isMainCheckout(facts)).toBe(false);
      }),
    );
  });
});
