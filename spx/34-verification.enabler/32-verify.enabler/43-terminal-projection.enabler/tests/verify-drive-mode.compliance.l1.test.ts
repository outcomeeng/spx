import { describe, it } from "vitest";

import {
  assertCallerDrivenRunAdvertisesEvidenceAppendActions,
  assertSpxDrivenRunAdvertisesNoEvidenceAppendAction,
} from "@testing/harnesses/verify/harness";

describe("verify next-action drive-mode compliance", () => {
  it("advertises the caller evidence-append actions for a caller-driven run", async () => {
    await assertCallerDrivenRunAdvertisesEvidenceAppendActions();
  });

  it("advertises no caller evidence-append action for an unsealed spx-driven run", async () => {
    await assertSpxDrivenRunAdvertisesNoEvidenceAppendAction();
  });
});
