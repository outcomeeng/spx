import { describe, expect, it } from "vitest";

import {
  BUILD_INVOCATION,
  FORMAT_CHECK_INVOCATION,
  FORMAT_INVOCATION,
  PACKAGED_CLI_INVOCATION,
  PREPUBLISH_HOOK_INVOCATION,
  SOURCE_CLI_INVOCATION,
  VITEST_RUN_INVOCATION,
} from "@/interfaces/cli/invocation";
import packageJson from "@root/package.json";

const scripts: Record<string, string> = packageJson.scripts;

describe("package scripts — CLI boundary compliance", () => {
  it("development validation scripts execute the source CLI explicitly", () => {
    const expectations: Record<string, string> = {
      typecheck: `${SOURCE_CLI_INVOCATION} validation typescript`,
      "typecheck:production": `${SOURCE_CLI_INVOCATION} validation typescript --scope production`,
      lint: `${SOURCE_CLI_INVOCATION} validation lint`,
      "lint:fix": `${SOURCE_CLI_INVOCATION} validation lint --fix`,
      "lint:production": `${SOURCE_CLI_INVOCATION} validation lint --scope production`,
      validate: `${SOURCE_CLI_INVOCATION} validation all`,
      "validate:production": `${SOURCE_CLI_INVOCATION} validation all --scope production`,
      knip: `${SOURCE_CLI_INVOCATION} validation knip`,
      circular: `${SOURCE_CLI_INVOCATION} validation circular`,
    };

    for (const [scriptName, command] of Object.entries(expectations)) {
      expect(scripts[scriptName]).toBe(command);
    }
  });

  it("publish validation runs only through the packaged executable after build", () => {
    expect(scripts["validate:published"]).toBe(`${PACKAGED_CLI_INVOCATION} validation all --scope production`);
    expect(scripts["publish:check"]).toBe(
      `pnpm run validate && ${BUILD_INVOCATION} && ${VITEST_RUN_INVOCATION} && pnpm run validate:published`,
    );
    expect(scripts.prepublishOnly).toBe(PREPUBLISH_HOOK_INVOCATION);
  });

  it("the default test script builds before running CLI subprocess tests", () => {
    expect(scripts.test).toBe(`${BUILD_INVOCATION} && ${VITEST_RUN_INVOCATION}`);
  });

  it("format scripts invoke dprint", () => {
    expect(scripts.format).toBe(FORMAT_INVOCATION);
    expect(scripts["format:check"]).toBe(FORMAT_CHECK_INVOCATION);
  });
});
