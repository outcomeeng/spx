import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyInputCommand, verifyStartCommand } from "@/commands/verify/cli";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseInputReport,
  parseStartReport,
  verifyDeps,
  verifyInputOptions,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

describe("verify start compliance", () => {
  it("requires a non-blank --input source before starting a run", async () => {
    const scenario = createVerifyRunContextScenario();

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankInputSource(), async (blankInput) => {
        const fs = createInMemoryStateStoreFileSystem();
        const started = await verifyStartCommand(
          { ...verifyStartOptions(scenario), input: blankInput },
          verifyDeps(scenario, fs),
        );
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toBe(VERIFY_CLI_ERROR.INPUT_REQUIRED);
      }),
    );
  });

  it("records the verification input at start so the input verb replays it", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseInputReport(replayed.output).content).toBe(scenario.inputContent);
  });

  it("reports every run-locator selector a caller persists to replay the run identity", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();

    const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const { locator } = parseStartReport(started.output);
    const selectors = [
      locator.runToken,
      locator.verificationType,
      locator.scopeType,
      locator.scopeIdentity,
      locator.backendIdentity,
      locator.storageNamespace,
      locator.runTarget,
    ];
    for (const selector of selectors) {
      expect(selector.length).toBeGreaterThan(0);
    }
  });
});
