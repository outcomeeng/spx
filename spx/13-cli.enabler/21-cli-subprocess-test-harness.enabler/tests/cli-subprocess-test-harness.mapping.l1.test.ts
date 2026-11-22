import { realpathSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { detectWorktreeProductRoot } from "@/lib/git/root";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE, PRODUCT_ROOT, VERSION_FLAG } from "@testing/harnesses/constants";

describe("CLI subprocess test harness mapping", () => {
  it("maps the product root to the git worktree root that holds this test", async () => {
    // Git locates the root from this test file's own directory, independently of the relative path the harness resolves.
    const located = await detectWorktreeProductRoot(dirname(fileURLToPath(import.meta.url)));
    expect(located.isGitRepo).toBe(true);
    expect(realpathSync(PRODUCT_ROOT)).toBe(realpathSync(located.productDir));
  });

  it("maps CLI subprocess constants to product-rooted executable and timing contracts", () => {
    expect(isAbsolute(PRODUCT_ROOT)).toBe(true);
    expect(isAbsolute(CLI_PATH)).toBe(true);
    expect(dirname(dirname(CLI_PATH))).toBe(PRODUCT_ROOT);
    expect(CLI_PATH).toMatch(/bin\/spx\.js$/u);
    expect(NODE_EXECUTABLE).toMatch(/^node$/u);
    expect(VERSION_FLAG).toMatch(/^--version$/u);

    expect(CLI_TIMEOUTS_MS.PROCESS_START).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    expect(CLI_TIMEOUTS_MS.E2E).toBeLessThan(CLI_TIMEOUTS_MS.E2E_BATCH);
    expect(CLI_TIMEOUTS_MS.E2E_BATCH).toBeLessThan(CLI_TIMEOUTS_MS.E2E_LONG_BATCH);
    expect(CLI_TIMEOUTS_MS.STATUS_CHECK_AVG).toBeLessThan(CLI_TIMEOUTS_MS.PROCESS_START);
  });
});
