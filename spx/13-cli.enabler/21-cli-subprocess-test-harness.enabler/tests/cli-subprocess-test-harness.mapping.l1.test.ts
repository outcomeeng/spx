import { dirname, isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { PACKAGED_CLI_ARTIFACT } from "@/interfaces/cli/artifact";
import {
  CLI_PATH,
  CLI_SOURCE_ENTRYPOINT_PATHS,
  CLI_TIMEOUTS_MS,
  NODE_EXECUTABLE,
  PRODUCT_ROOT,
  VERSION_FLAG,
} from "@testing/harnesses/constants";

describe("CLI subprocess test harness mapping", () => {
  it("maps CLI subprocess constants to product-rooted executable and timing contracts", () => {
    expect(isAbsolute(PRODUCT_ROOT)).toBe(true);
    expect(isAbsolute(CLI_PATH)).toBe(true);
    expect(dirname(dirname(CLI_PATH))).toBe(PRODUCT_ROOT);
    expect(CLI_PATH.endsWith(PACKAGED_CLI_ARTIFACT.launcherPath)).toBe(true);
    expect(NODE_EXECUTABLE).toBe(PACKAGED_CLI_ARTIFACT.runtimeExecutable);
    expect(VERSION_FLAG).toBe(PACKAGED_CLI_ARTIFACT.invocationFlags.version);
    expect(CLI_SOURCE_ENTRYPOINT_PATHS).toBe(PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths);

    expect(CLI_TIMEOUTS_MS.PROCESS_START).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    expect(CLI_TIMEOUTS_MS.E2E).toBeLessThan(CLI_TIMEOUTS_MS.E2E_BATCH);
    expect(CLI_TIMEOUTS_MS.E2E_BATCH).toBeLessThan(CLI_TIMEOUTS_MS.E2E_LONG_BATCH);
    expect(CLI_TIMEOUTS_MS.STATUS_CHECK_AVG).toBeLessThan(CLI_TIMEOUTS_MS.PROCESS_START);
  });
});
