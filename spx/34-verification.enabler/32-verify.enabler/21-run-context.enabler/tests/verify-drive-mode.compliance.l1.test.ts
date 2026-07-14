import { describe, it } from "vitest";

import {
  assertStartRecordsCallerDriveModeByDefault,
  assertStartRecordsSpxDriveModeWhenSpxDriven,
} from "@testing/harnesses/verify/harness";

describe("verify start drive-mode compliance", () => {
  it("records caller-driven drive mode for the caller start path", async () => {
    await assertStartRecordsCallerDriveModeByDefault();
  });

  it("records spx-driven drive mode when spx opens the run", async () => {
    await assertStartRecordsSpxDriveModeWhenSpxDriven();
  });
});
