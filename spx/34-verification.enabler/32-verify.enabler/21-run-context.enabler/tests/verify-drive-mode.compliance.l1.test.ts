import { describe, expect, it } from "vitest";

import { createRecorderOperations } from "@/commands/verification-exec/recorder-operations";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  VERIFY_DRIVE_MODE,
  VERIFY_INPUT_SOURCE,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
} from "@/domains/verify/verify";
import { VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryDriveModeOverrideOption } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  eventDataRecord,
  observeCallerStartDriveMode,
  readVerifyRunEvents,
  verifyDeps,
} from "@testing/harnesses/verify/harness";
import { observeVerificationInvocation } from "@testing/harnesses/verify/rejected-invocation";

const flagOf = (optionExpression: string): string => optionExpression.split(" ")[0] ?? optionExpression;

describe("verify start drive-mode compliance", () => {
  it("records caller-driven drive mode for the caller start path", async () => {
    await observeCallerStartDriveMode().then((observation) => {
      expect(observation.started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(observation.runContextCount).toBe(1);
      expect(observation.recordedDriveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
    });
  });

  // spx opens a run when the executor drives it: the executor's recorder operations open the run, and
  // the run's journal is the oracle for the drive mode that open recorded.
  it("records spx-driven drive mode when spx opens the run through the executor's recorder operations", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const recorder = createRecorderOperations({ input: VERIFY_INPUT_SOURCE.STDIN, deps: verifyDeps(scenario, fs) });

    const locator = await recorder.open({
      verificationType: scenario.verificationType,
      scopeType: scenario.scopeType,
      scope: scenario.scope,
      productDir: scenario.productDir,
      testPaths: scenario.changedPaths,
    });
    const runContexts = (await readVerifyRunEvents(scenario, locator.runToken, fs)).filter(
      (event) => event.type === VERIFY_RUN_CONTEXT_EVENT_TYPE,
    );

    expect(locator.verificationType).toBe(scenario.verificationType);
    expect(runContexts).toHaveLength(1);
    expect(eventDataRecord(runContexts[0])[VERIFY_RUN_CONTEXT_EVENT_FIELD.DRIVE_MODE]).toBe(VERIFY_DRIVE_MODE.SPX);
  });

  it("rejects a caller attempt to select spx-driven mode", async () => {
    const scenario = createVerifyRunContextScenario();
    const forbiddenOption = sampleGeneratedValue(arbitraryDriveModeOverrideOption());

    const observation = await observeVerificationInvocation([
      VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
      VERIFICATION_RUN_CLI_SURFACE.runCommandName,
      VERIFY_CLI.startCommandName,
      flagOf(VERIFY_CLI.verificationTypeOption),
      scenario.verificationType,
      flagOf(VERIFY_CLI.scopeTypeOption),
      scenario.scopeType,
      flagOf(VERIFY_CLI.scopeOption),
      scenario.scope,
      flagOf(VERIFY_CLI.inputOption),
      sampleGeneratedValue(arbitrarySourceFilePath()),
      forbiddenOption,
      VERIFY_DRIVE_MODE.SPX,
    ]);

    expect(observation.rejected).toBe(true);
    expect(observation.exitCode).toBeGreaterThan(0);
    expect(observation.stderr).toContain(forbiddenOption);
    expect(observation.handlerInvocationCount).toBe(0);
  });
});
