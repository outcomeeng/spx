import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAIN_CHECKOUT_GATE_EXIT_CODE, mainCheckoutGateExitCode } from "@/lib/precommit/main-checkout-gate";
import {
  arbitraryMainCheckoutFacts,
  arbitraryNonBareLinkedFacts,
  arbitraryPoolFactsSample,
} from "@testing/generators/main-checkout/main-checkout";

describe("mainCheckoutGateExitCode", () => {
  it("maps unreadable git facts and main-checkout facts to the rebuild exit code", () => {
    fc.assert(
      fc.property(fc.option(arbitraryMainCheckoutFacts(), { nil: null }), (facts) => {
        expect(mainCheckoutGateExitCode(facts)).toBe(MAIN_CHECKOUT_GATE_EXIT_CODE.MAIN_CHECKOUT);
      }),
    );
  });

  it("maps incomplete bare-pool worktree-list facts to the rebuild exit code", () => {
    fc.assert(
      fc.property(arbitraryPoolFactsSample(), (sample) => {
        expect(mainCheckoutGateExitCode(sample.unreadableWorktreeList)).toBe(
          MAIN_CHECKOUT_GATE_EXIT_CODE.MAIN_CHECKOUT,
        );
      }),
    );
  });

  it("maps non-main checkout facts to the classified skip exit code", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbitraryNonBareLinkedFacts(),
          arbitraryPoolFactsSample().map((sample) => sample.basenameMismatch),
          arbitraryPoolFactsSample().map((sample) => sample.siblingMismatch),
          arbitraryPoolFactsSample().map((sample) => sample.originUnset),
          arbitraryPoolFactsSample().map((sample) => sample.missingDesignatedWorktree),
          arbitraryPoolFactsSample().map((sample) => sample.unlistedMainCheckoutRoot),
        ),
        (facts) => {
          expect(mainCheckoutGateExitCode(facts)).toBe(MAIN_CHECKOUT_GATE_EXIT_CODE.NON_MAIN_CHECKOUT);
        },
      ),
    );
  });
});
