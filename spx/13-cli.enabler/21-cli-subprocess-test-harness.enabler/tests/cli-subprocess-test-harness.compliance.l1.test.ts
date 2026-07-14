import { describe, expect, it } from "vitest";

import { PACKAGED_CLI_ARTIFACT } from "@/interfaces/cli/artifact";
import { CLI_PATH, CLI_SOURCE_ENTRYPOINT_PATHS, PRODUCT_ROOT } from "@testing/harnesses/constants";

describe("CLI subprocess test harness compliance", () => {
  it("targets the packaged executable under the product root", () => {
    expect(CLI_PATH.startsWith(PRODUCT_ROOT)).toBe(true);
    expect(CLI_PATH.endsWith(PACKAGED_CLI_ARTIFACT.launcherPath)).toBe(true);
    expect(CLI_SOURCE_ENTRYPOINT_PATHS).toEqual(PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths);
    expect(CLI_SOURCE_ENTRYPOINT_PATHS).not.toContain(PACKAGED_CLI_ARTIFACT.launcherPath);
  });
});
