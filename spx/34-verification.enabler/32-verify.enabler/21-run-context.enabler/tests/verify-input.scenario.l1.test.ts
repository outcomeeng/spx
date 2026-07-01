import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyInputCommand, verifyStartCommand } from "@/commands/verify/cli";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseInputReport,
  parseStartReport,
  verifyDeps,
  verifyInputOptions,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

describe("verify input replay", () => {
  it("returns the exact verification input whose digest was recorded at start", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const deps = verifyDeps(scenario, fs);

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);

    const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const inputReport = parseInputReport(replayed.output);
    expect(inputReport.content).toBe(scenario.inputContent);
    expect(inputReport.source).toBe(startReport.input.source);
    expect(inputReport.digest).toBe(startReport.input.digest);
  });
});
