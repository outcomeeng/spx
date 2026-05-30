/**
 * Test harness for markdown validation.
 *
 * Copies fixture directories to temp dirs and runs test callbacks
 * against them. Follows the harness pattern from /testing-typescript.
 */

import { cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withTempDir } from "@testing/harnesses/with-temp-dir";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_ROOT = resolve(__dirname, "../fixtures/markdown");

export const MARKDOWN_FIXTURES = {
  CLEAN_TREE: "clean-tree",
  BROKEN_LINKS: "broken-links",
  WITH_EXCLUDE: "with-exclude",
  DUPLICATE_HEADINGS: "duplicate-headings",
} as const;

export type MarkdownFixtureName = (typeof MARKDOWN_FIXTURES)[keyof typeof MARKDOWN_FIXTURES];

export const MARKDOWN_HARNESS_TIMEOUT = 15_000;

export interface MarkdownEnvContext {
  /** Absolute path to the temp directory root (contains spx/ and docs/). */
  path: string;
  /** Absolute path to spx/ inside the temp directory. */
  spxDir: string;
  /** Absolute path to docs/ inside the temp directory (may not exist). */
  docsDir: string;
}

export interface MarkdownEnvOptions {
  fixture: MarkdownFixtureName;
}

/**
 * Creates an isolated test environment with a markdown fixture.
 *
 * 1. Creates a temporary directory
 * 2. Copies the specified fixture into it
 * 3. Runs the test callback with paths
 * 4. Cleans up after (even on failure)
 */
export function withMarkdownEnv(
  opts: MarkdownEnvOptions,
  testFn: (context: MarkdownEnvContext) => Promise<void>,
): Promise<void> {
  return withTempDir("mdlint-harness-", async (tempDir) => {
    const fixtureSource = join(FIXTURES_ROOT, opts.fixture);
    await cp(fixtureSource, tempDir, { recursive: true });

    await testFn({
      path: tempDir,
      spxDir: join(tempDir, "spx"),
      docsDir: join(tempDir, "docs"),
    });
  });
}
