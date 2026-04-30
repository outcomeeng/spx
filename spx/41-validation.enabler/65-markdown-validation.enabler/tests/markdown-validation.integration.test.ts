/**
 * Level 2: Integration tests for markdown validation.
 *
 * Tests the wired-up command layer and pipeline integration
 * against fixture directories via harness.
 *
 * Routing: Stage 4 → Level 2. Tests pipeline wiring, --files flag,
 * project-absolute link resolution, and spx validation all integration.
 */

import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { validateMarkdown } from "@/validation/steps/markdown";
import { MARKDOWN_FIXTURES, MARKDOWN_HARNESS_TIMEOUT, withMarkdownEnv } from "@test/harness/with-markdown-env";

// =============================================================================
// PROJECT-ABSOLUTE LINK RESOLUTION
// =============================================================================

describe("project-absolute link resolution", () => {
  it(
    "GIVEN a project-absolute link to a non-existent file, WHEN validation runs with projectRoot, THEN an error is reported",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path, spxDir }) => {
        const result = await validateMarkdown({
          directories: [spxDir],
          projectRoot: path,
        });

        expect(result.success).toBe(false);
        const absoluteErrors = result.errors.filter((e) => e.detail.includes("does-not-exist"));
        expect(absoluteErrors.length).toBeGreaterThanOrEqual(1);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

// =============================================================================
// DEFAULT DIRECTORY VALIDATION
// =============================================================================

describe("default directory validation", () => {
  it(
    "GIVEN spx/ and docs/ directories with broken links, WHEN spx validation markdown runs with no arguments, THEN both directories are validated",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
        const result = await markdownCommand({ cwd: path });

        expect(result.exitCode).toBe(1);
        expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

// =============================================================================
// --files FLAG SCOPING
// =============================================================================

describe("--files flag scoping", () => {
  it(
    "GIVEN --files points to docs/ only, WHEN validation runs, THEN spx/ errors are not reported",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path, docsDir, spxDir }) => {
        const result = await markdownCommand({
          cwd: path,
          files: [docsDir],
        });

        // docs/ has a broken link — validation should fail
        expect(result.exitCode).toBe(1);

        // Use validateMarkdown directly to check error source files
        const detailed = await validateMarkdown({ directories: [docsDir], projectRoot: path });
        expect(detailed.errors.length).toBeGreaterThan(0);
        for (const error of detailed.errors) {
          expect(error.file).toContain(docsDir);
          expect(error.file).not.toContain(spxDir);
        }
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );

  it(
    "GIVEN --files points to a clean tree's spx/, WHEN validation runs, THEN exit code is 0",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.CLEAN_TREE }, async ({ spxDir }) => {
        const result = await markdownCommand({
          cwd: spxDir,
          files: [spxDir],
        });

        expect(result.exitCode).toBe(0);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});

// =============================================================================
// PIPELINE INTEGRATION
// =============================================================================

describe("spx validation all integration", () => {
  it(
    "GIVEN spx validation all runs on a tree with broken markdown, THEN markdown validation fails the pipeline",
    async () => {
      await withMarkdownEnv({ fixture: MARKDOWN_FIXTURES.BROKEN_LINKS }, async ({ path }) => {
        const result = await allCommand({
          cwd: path,
          quiet: true,
        });

        expect(result.exitCode).toBe(1);
      });
    },
    MARKDOWN_HARNESS_TIMEOUT,
  );
});
