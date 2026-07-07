import {
  assertIncompleteBarePoolFactsMapToRebuild,
  assertMainCheckoutFactsMapToRebuild,
  assertNonMainCheckoutFactsMapToSkip,
} from "@testing/harnesses/precommit/main-checkout-gate";
import { describe, it } from "vitest";

describe("mainCheckoutGateExitCode", () => {
  it("maps unreadable git facts and main-checkout facts to the rebuild exit code", () => {
    assertMainCheckoutFactsMapToRebuild();
  });

  it("maps incomplete bare-pool worktree-list facts to the rebuild exit code", () => {
    assertIncompleteBarePoolFactsMapToRebuild();
  });

  it("maps non-main checkout facts to the classified skip exit code", () => {
    assertNonMainCheckoutFactsMapToSkip();
  });
});
