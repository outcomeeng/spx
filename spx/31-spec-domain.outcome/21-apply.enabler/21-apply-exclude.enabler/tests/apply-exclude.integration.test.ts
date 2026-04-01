/**
 * Integration tests for apply-exclude enabler.
 *
 * Test Level: 2 (Integration)
 * - Uses real file I/O via createApplyHarness
 * - Tests the full command handler pipeline with temp directories
 *
 * Assertions covered from apply-exclude.md:
 * - S1: Flat node path → 3 tool configs (via real files)
 * - S5: Already in sync → no changes (via real files)
 * - S6: EXCLUDE missing → error code 1 (via real files)
 */

import { access } from "node:fs/promises";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  applyExcludeCommand,
  MYPY_SECTION,
  PYRIGHT_SECTION,
  PYTEST_SECTION,
  PYTHON_CONFIG_FILE,
  toPytestIgnore,
} from "@/spec/apply/exclude";
import { createApplyHarness } from "@/spec/apply/testing/harness";

/** Real file system dependencies for integration tests */
const REAL_DEPS = {
  readFile: (path: string) => readFile(path, "utf-8"),
  writeFile: (path: string, content: string) => writeFile(path, content, "utf-8"),
  fileExists: async (path: string) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
};

const MINIMAL_PYPROJECT = [
  "[project]",
  "name = \"test-project\"",
  "",
  `[${PYTEST_SECTION}]`,
  "addopts = \"--strict-markers\"",
  "",
  `[${MYPY_SECTION}]`,
  "exclude = [",
  "    \"build/\",",
  "]",
  "",
  `[${PYRIGHT_SECTION}]`,
  "exclude = [",
  "    \"build/\",",
  "]",
  "",
].join("\n");

const TEST_NODE = "21-feature.enabler";

describe("applyExcludeCommand (integration)", () => {
  // S1: Full pipeline with real files
  it("GIVEN real EXCLUDE and pyproject.toml WHEN command runs THEN pyproject.toml is updated on disk", async () => {
    const harness = await createApplyHarness();
    try {
      await harness.writeExclude([TEST_NODE]);
      await harness.writeConfig(PYTHON_CONFIG_FILE, MINIMAL_PYPROJECT);

      const result = await applyExcludeCommand({
        cwd: harness.projectDir,
        deps: REAL_DEPS,
      });

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Updated");

      // Verify the file was actually written to disk
      const updated = await harness.readConfig(PYTHON_CONFIG_FILE);
      expect(updated).toContain(toPytestIgnore(TEST_NODE));
      expect(updated).toContain("build/"); // Non-excluded entries preserved
    } finally {
      await harness.cleanup();
    }
  });

  // S5: Idempotency with real files
  it("GIVEN pyproject.toml already in sync WHEN command runs again THEN reports no changes", async () => {
    const harness = await createApplyHarness();
    try {
      await harness.writeExclude([TEST_NODE]);
      await harness.writeConfig(PYTHON_CONFIG_FILE, MINIMAL_PYPROJECT);

      // First apply
      await applyExcludeCommand({ cwd: harness.projectDir, deps: REAL_DEPS });

      const afterFirst = await harness.readConfig(PYTHON_CONFIG_FILE);

      // Second apply
      const result = await applyExcludeCommand({ cwd: harness.projectDir, deps: REAL_DEPS });

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already in sync");

      // File unchanged
      const afterSecond = await harness.readConfig(PYTHON_CONFIG_FILE);
      expect(afterSecond).toBe(afterFirst);
    } finally {
      await harness.cleanup();
    }
  });

  // S6: Missing EXCLUDE with real filesystem
  it("GIVEN no spx/EXCLUDE file WHEN command runs THEN returns exit code 1", async () => {
    const harness = await createApplyHarness();
    try {
      // Write pyproject but NOT EXCLUDE
      await harness.writeConfig(PYTHON_CONFIG_FILE, MINIMAL_PYPROJECT);

      const result = await applyExcludeCommand({
        cwd: harness.projectDir,
        deps: REAL_DEPS,
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("not found");
    } finally {
      await harness.cleanup();
    }
  });

  // No config file detected
  it("GIVEN EXCLUDE exists but no config file WHEN command runs THEN returns exit code 1", async () => {
    const harness = await createApplyHarness();
    try {
      await harness.writeExclude([TEST_NODE]);
      // No pyproject.toml written

      const result = await applyExcludeCommand({
        cwd: harness.projectDir,
        deps: REAL_DEPS,
      });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("no supported config file");
    } finally {
      await harness.cleanup();
    }
  });
});
