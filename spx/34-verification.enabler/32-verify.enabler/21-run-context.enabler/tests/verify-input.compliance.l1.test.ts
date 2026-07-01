import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  type VerifyCliDeps,
  verifyInputCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createRecordingInputReader,
  createVerifyRunContextScenario,
  parseInputReport,
  parseStartReport,
  verifyDeps,
  verifyInputOptions,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

describe("verify input compliance", () => {
  it("requires a non-blank --run token", async () => {
    const scenario = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankRunToken(), async (blankRun) => {
        const fs = createInMemoryStateStoreFileSystem();
        const replayed = await verifyInputCommand(verifyInputOptions(scenario, blankRun), verifyDeps(scenario, fs));
        expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(replayed.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
      }),
    );
  });

  it("rejects a type/scope-only selection without a run token even when a run exists in the namespace", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankRunToken(), async (blankRun) => {
        const replayed = await verifyInputCommand(verifyInputOptions(scenario, blankRun), deps);
        expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(replayed.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
      }),
    );
  });

  it("names the run token, verification type, scope type, and scope identity when the run cannot be located", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const missingRunToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, missingRunToken), verifyDeps(scenario, fs));

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(missingRunToken);
    expect(replayed.output).toContain(scenario.verificationType);
    expect(replayed.output).toContain(VERIFY_SCOPE_TYPE.CHANGESET);
    expect(replayed.output).toContain(scenario.scope);
  });

  it("replays the recorded input rather than reading a fresh input source", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);

    const reader = createRecordingInputReader();
    const replayDeps: VerifyCliDeps = { ...deps, readInputSource: reader.read };
    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), replayDeps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseInputReport(replayed.output).content).toBe(scenario.inputContent);
    expect(reader.calls()).toBe(0);
  });
});
