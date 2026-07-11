import { assertMainCheckoutReleaseOccupancy } from "@testing/harnesses/precommit/main-checkout-occupancy";
import { describe, expect, it } from "vitest";

describe("main-checkout occupancy during product self-release", () => {
  it("keeps main occupied while release tags and the operator-visible CLI are verified", async () => {
    await expect(assertMainCheckoutReleaseOccupancy()).resolves.toBeUndefined();
  });
});
