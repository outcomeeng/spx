import { describe, expect, it } from "vitest";

import packageJson from "@root/package.json";

const scripts: Record<string, string> = packageJson.scripts;

const SOURCE_CLI = "tsx src/cli.ts";
const PACKAGED_CLI = "node bin/spx.js";
const SOURCE_SCRIPT_EXPECTATIONS = {
  typecheck: `${SOURCE_CLI} validation typescript`,
  "typecheck:production": `${SOURCE_CLI} validation typescript --scope production`,
  lint: `${SOURCE_CLI} validation lint`,
  "lint:fix": `${SOURCE_CLI} validation lint --fix`,
  "lint:production": `${SOURCE_CLI} validation lint --scope production`,
  validate: `${SOURCE_CLI} validation all`,
  "validate:production": `${SOURCE_CLI} validation all --scope production`,
  knip: `${SOURCE_CLI} validation knip`,
  circular: `${SOURCE_CLI} validation circular`,
} as const;
const PUBLISHED_VALIDATION_SCRIPT = `${PACKAGED_CLI} validation all --scope production`;
const PUBLISH_CHECK_SCRIPT = "pnpm run validate && pnpm run build && vitest run && pnpm run validate:published";
const PREPUBLISH_SCRIPT = "pnpm run publish:check";
const TEST_SCRIPT = "pnpm run build && vitest run";
const FORMAT_SCRIPT = "dprint fmt .";
const FORMAT_CHECK_SCRIPT = "dprint check .";

describe("package scripts — CLI boundary compliance", () => {
  it("development validation scripts execute the source CLI explicitly", () => {
    for (const [scriptName, command] of Object.entries(SOURCE_SCRIPT_EXPECTATIONS)) {
      expect(scripts[scriptName]).toBe(command);
    }
  });

  it("publish validation runs only through the packaged executable after build", () => {
    expect(scripts["validate:published"]).toBe(PUBLISHED_VALIDATION_SCRIPT);
    expect(scripts["publish:check"]).toBe(PUBLISH_CHECK_SCRIPT);
    expect(scripts.prepublishOnly).toBe(PREPUBLISH_SCRIPT);
  });

  it("the default test script builds before running CLI subprocess tests", () => {
    expect(scripts.test).toBe(TEST_SCRIPT);
  });

  it("format scripts invoke dprint", () => {
    expect(scripts.format).toBe(FORMAT_SCRIPT);
    expect(scripts["format:check"]).toBe(FORMAT_CHECK_SCRIPT);
  });
});
