import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mainCheckoutPath } from "@/git/root";
import {
  arbitraryMainCheckoutFacts,
  arbitraryMainCheckoutPathCase,
} from "@testing/generators/main-checkout/main-checkout";

describe("mainCheckoutPath — designate the main checkout's path from layout", () => {
  it("designates the lone worktree in a single-tree layout, an observed origin-repository-named sibling in a pool, and no path when the pool resolves no such worktree", () => {
    fc.assert(
      fc.property(arbitraryMainCheckoutPathCase(), ({ facts, expectedPath }) => {
        expect(mainCheckoutPath(facts)).toBe(expectedPath);
      }),
    );
  });

  it("designates a checkout's own worktree root when that checkout is the main checkout", () => {
    fc.assert(
      fc.property(arbitraryMainCheckoutFacts(), (facts) => {
        expect(mainCheckoutPath(facts)).toBe(facts.worktreeRoot);
      }),
    );
  });
});
