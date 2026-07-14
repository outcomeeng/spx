import { describe, it } from "vitest";

import {
  assertAbsentRunContextFoldsToCallerDriveMode,
  assertCallerDrivenRunAdvertisesEvidenceAppendActions,
  assertMalformedRunContextFoldsToCallerDriveMode,
  assertSpxDrivenRunAdvertisesNoEvidenceAppendAction,
} from "@testing/harnesses/verify/harness";

describe("verify next-action drive-mode compliance", () => {
  it("advertises the caller evidence-append actions for a caller-driven run", async () => {
    await assertCallerDrivenRunAdvertisesEvidenceAppendActions();
  });

  it("advertises no caller evidence-append action for an unsealed spx-driven run", async () => {
    await assertSpxDrivenRunAdvertisesNoEvidenceAppendAction();
  });

  it("folds a history with no run-context event to caller-driven", async () => {
    await assertAbsentRunContextFoldsToCallerDriveMode();
  });

  it("folds a run-context event with an absent drive-mode field to caller-driven", async () => {
    await assertMalformedRunContextFoldsToCallerDriveMode();
  });
});
