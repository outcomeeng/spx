import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isMainCheckout } from "@/lib/git/root";
import {
  arbitraryNonBareLinkedFacts,
  arbitraryNonBareMainFacts,
  arbitraryPoolFactsSample,
} from "@testing/generators/main-checkout/main-checkout";

describe("isMainCheckout — bare-pool observed-root mapping", () => {
  it("identifies the main checkout only when the repository-name basename, sibling placement, observed root, and origin agree", () => {
    fc.assert(
      fc.property(arbitraryPoolFactsSample(), (sample) => {
        expect(isMainCheckout(sample.mainCheckout)).toBe(true);
        expect(isMainCheckout(sample.separatorVariantMainCheckout)).toBe(true);
        expect(isMainCheckout(sample.basenameMismatch)).toBe(false);
        expect(isMainCheckout(sample.siblingMismatch)).toBe(false);
        expect(isMainCheckout(sample.originUnset)).toBe(false);
        expect(isMainCheckout(sample.missingDesignatedWorktree)).toBe(false);
        expect(isMainCheckout(sample.unlistedMainCheckoutRoot)).toBe(false);
      }),
    );
  });
});

describe("isMainCheckout — non-bare repository mapping", () => {
  it("identifies the main working tree — the parent of the git-common-dir — as the main checkout", () => {
    fc.assert(
      fc.property(arbitraryNonBareMainFacts(), (facts) => {
        expect(isMainCheckout(facts)).toBe(true);
      }),
    );
  });

  it("does not identify a linked worktree as the main checkout, even when its name matches the bare-pool rule", () => {
    fc.assert(
      fc.property(arbitraryNonBareLinkedFacts(), (facts) => {
        expect(isMainCheckout(facts)).toBe(false);
      }),
    );
  });
});
