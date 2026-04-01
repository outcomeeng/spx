/**
 * Apply test harness — reusable fixture factory for apply-exclude tests.
 *
 * Provides temp directory creation with spx/EXCLUDE and config files.
 * Follows the session harness pattern at src/session/testing/harness.ts.
 *
 * @module spec/apply/testing/harness
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { COMMENT_CHAR, EXCLUDE_FILENAME, SPX_PREFIX } from "../exclude/constants.js";

/** Header lines written to spx/EXCLUDE before node paths */
const EXCLUDE_HEADER = [
  `${COMMENT_CHAR} Nodes excluded from the quality gate.`,
  `${COMMENT_CHAR} Specs and tests exist. Implementation does not.`,
  "",
].join("\n");

/**
 * Apply test harness interface.
 */
export interface ApplyHarness {
  /** Absolute path to the temp project root directory */
  readonly projectDir: string;

  /** Writes spx/EXCLUDE with the given node paths */
  writeExclude(nodes: string[]): Promise<void>;

  /** Writes a config file (e.g., pyproject.toml) at the project root */
  writeConfig(filename: string, content: string): Promise<void>;

  /** Reads a config file back from the project root */
  readConfig(filename: string): Promise<string>;

  /** Removes the temp directory and all contents */
  cleanup(): Promise<void>;
}

/**
 * Creates an apply test harness with a temp directory containing
 * an spx/ subdirectory for EXCLUDE files.
 *
 * @returns A harness with helpers for writing test fixtures and cleanup
 */
export async function createApplyHarness(): Promise<ApplyHarness> {
  const projectDir = await mkdtemp(join(tmpdir(), "spx-apply-harness-"));

  // Create the spx/ subdirectory
  await mkdir(join(projectDir, SPX_PREFIX), { recursive: true });

  return {
    projectDir,

    async writeExclude(nodes: string[]): Promise<void> {
      const content = EXCLUDE_HEADER + nodes.join("\n") + "\n";
      await writeFile(join(projectDir, SPX_PREFIX, EXCLUDE_FILENAME), content);
    },

    async writeConfig(filename: string, content: string): Promise<void> {
      await writeFile(join(projectDir, filename), content);
    },

    async readConfig(filename: string): Promise<string> {
      return readFile(join(projectDir, filename), "utf-8");
    },

    async cleanup(): Promise<void> {
      await rm(projectDir, { recursive: true, force: true });
    },
  };
}
