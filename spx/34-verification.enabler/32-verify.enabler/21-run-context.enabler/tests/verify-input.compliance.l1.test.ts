import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD,
  type VerifyCliDeps,
  verifyInputCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createRecordingInputReader,
  createVerifyRunContextScenario,
  parseInputReport,
  parseStartReport,
  verifyDeps,
  verifyInputOptions,
  verifyInputRecordFilePath,
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

  it("names every run selector and searched target when the run cannot be located", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);
    const missingRunToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, missingRunToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(missingRunToken);
    expect(replayed.output).toContain(scenario.verificationType);
    expect(replayed.output).toContain(VERIFY_SCOPE_TYPE.CHANGESET);
    expect(replayed.output).toContain(scenario.scope);
    expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.BACKEND}${JOURNAL_BACKEND.LOCAL}`);
    expect(replayed.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.NAMESPACE);
    expect(replayed.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET);
    expect(replayed.output).toContain(verifyInputRecordFilePath(scenario, missingRunToken));
    expect(replayed.output).toContain(
      `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE_TYPE}${VERIFY_SCOPE_TYPE.CHANGESET}`,
    );
    expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE}${scenario.scope}`);
  });

  it("rejects an existing run token when the requested scope differs from the recorded run scope", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const { runToken } = parseStartReport(started.output);

    const replayed = await verifyInputCommand(
      { ...verifyInputOptions(scenario, runToken), scope: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}` },
      deps,
    );

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
    expect(replayed.output).toContain(verifyInputRecordFilePath(scenario, runToken));
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

  it("reports input-read failure when the recorded input file is missing selector fields", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);

    const malformedRecord = {
      source: startReport.input.source,
      digest: startReport.input.digest,
      content: scenario.inputContent,
    };
    await fs.writeFile(verifyInputRecordFilePath(scenario, startReport.runToken), JSON.stringify(malformedRecord));

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
  });

  it("reports input-read failure when the recorded input file is invalid JSON", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const invalidJson = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())).slice(0, -1);
    await fs.writeFile(verifyInputRecordFilePath(scenario, startReport.runToken), invalidJson);

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
  });
});
