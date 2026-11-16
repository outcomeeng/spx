import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  verifyRenderCommand,
  verifyStartCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import {
  projectVerifyRun,
  VERIFY_DRIVE_MODE,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyDriveMode,
} from "@/domains/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseRenderReport,
  parseStartReport,
  parseStatusReport,
  readVerifyRunEvents,
  verifyDepsWithDriveMode,
  verifyRenderOptions,
  verifyStartOptions,
  verifyStatusOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

/** Start a review run whose deps record `driveMode`, asserting the start succeeds. */
async function startRunUnderDriveMode(driveMode: VerifyDriveMode) {
  const scenario = withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW);
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDepsWithDriveMode(scenario, fs, driveMode);
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return { scenario, fs, deps, runToken: parseStartReport(started.output).runToken };
}

/** The status and render projections of one run, in that order. */
async function statusAndRender(run: Awaited<ReturnType<typeof startRunUnderDriveMode>>) {
  const { scenario, deps, runToken } = run;
  return [
    parseStatusReport((await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output),
    parseRenderReport((await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output),
  ] as const;
}

describe("verify next-action drive-mode compliance", () => {
  it("advertises the caller evidence-append actions for a caller-driven run", async () => {
    const run = await startRunUnderDriveMode(VERIFY_DRIVE_MODE.CALLER);
    for (const projected of await statusAndRender(run)) {
      expect(projected.driveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
      expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
      expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
      expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);
    }
  });

  it("advertises no caller evidence-append action for an unsealed spx-driven run", async () => {
    const run = await startRunUnderDriveMode(VERIFY_DRIVE_MODE.SPX);
    for (const projected of await statusAndRender(run)) {
      expect(projected.driveMode).toBe(VERIFY_DRIVE_MODE.SPX);
      expect(projected.sealed).toBe(false);
      expect(projected.nextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
      expect(projected.nextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
      expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);
    }
  });

  it("folds a history with no run-context event to caller-driven", async () => {
    // Dropping the run-context event from a real spx-driven run's history exercises the fold's
    // absent-event branch directly rather than only through `verify start`.
    const { scenario, fs, runToken } = await startRunUnderDriveMode(VERIFY_DRIVE_MODE.SPX);
    const events = await readVerifyRunEvents(scenario, runToken, fs);
    const projection = projectVerifyRun(events.filter((event) => event.type !== VERIFY_RUN_CONTEXT_EVENT_TYPE));
    expect(projection.driveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
    expect(projection.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
    expect(projection.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
  });

  it("folds a run-context event with an absent drive-mode field to caller-driven", async () => {
    // Blanking the run-context event's data on a real spx-driven run's history exercises the fold's
    // malformed-data branch, so an event omitting the drive-mode field cannot project as spx-driven.
    const { scenario, fs, runToken } = await startRunUnderDriveMode(VERIFY_DRIVE_MODE.SPX);
    const events = await readVerifyRunEvents(scenario, runToken, fs);
    const projection = projectVerifyRun(
      events.map((event) => event.type === VERIFY_RUN_CONTEXT_EVENT_TYPE ? { ...event, data: {} } : event),
    );
    expect(projection.driveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
    expect(projection.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
    expect(projection.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
  });
});
