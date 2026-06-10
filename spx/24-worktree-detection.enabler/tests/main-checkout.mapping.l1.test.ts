import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isMainCheckout } from "@/git/root";
import { arbitraryNonBareLinkedFacts, arbitraryPoolFactsSample } from "@testing/generators/main-checkout/main-checkout";

describe("isMainCheckout — bare-pool three-signal mapping", () => {
  it("identifies the main checkout only when branch, directory name, and sibling placement all agree", () => {
    fc.assert(
      fc.property(arbitraryPoolFactsSample(), (sample) => {
        expect(isMainCheckout(sample.mainCheckout)).toBe(true);
        expect(isMainCheckout(sample.branchMismatch)).toBe(false);
        expect(isMainCheckout(sample.basenameMismatch)).toBe(false);
        expect(isMainCheckout(sample.siblingMismatch)).toBe(false);
        expect(isMainCheckout(sample.defaultBranchUnset)).toBe(false);
      }),
    );
  });

  it("does not identify a non-bare repository's linked worktree as the main checkout, even when its name and branch match the bare-pool rule", () => {
    fc.assert(
      fc.property(arbitraryNonBareLinkedFacts(), (facts) => {
        expect(isMainCheckout(facts)).toBe(false);
      }),
    );
  });
});
