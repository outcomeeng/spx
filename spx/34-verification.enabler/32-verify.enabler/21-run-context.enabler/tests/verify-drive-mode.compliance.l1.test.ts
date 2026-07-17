import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_DRIVE_MODE } from "@/domains/verify/verify";
import {
  observeCallerDriveModeOverrideRejection,
  observeCallerStartDriveMode,
  observeSpxStartDriveMode,
} from "@testing/harnesses/verify/harness";

describe("verify start drive-mode compliance", () => {
  it("records caller-driven drive mode for the caller start path", async () => {
    await observeCallerStartDriveMode().then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(observation.recordedDriveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
    });
  });

  it("records spx-driven drive mode when spx opens the run", async () => {
    await observeSpxStartDriveMode().then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(observation.recordedDriveMode).toBe(VERIFY_DRIVE_MODE.SPX);
    });
  });

  it("rejects a caller attempt to select spx-driven mode", async () => {
    await observeCallerDriveModeOverrideRejection().then((observation) => {
      expect(observation.rejected).toBe(true);
      expect(observation.exitCode).toBeGreaterThan(0);
      expect(observation.stderr).toContain(observation.expectedDiagnosticToken);
      expect(observation.handlerInvocationCount).toBe(0);
    });
  });
});
