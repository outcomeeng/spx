/**
 * Level 2: Integration tests for validation CLI output formatting.
 * Story: story-48_validation-output-enhancements
 *
 * ADR-021: Tests use isolated fixture projects, never the live repo.
 * Tests verify the CLI produces expected output format.
 */

import { execa } from "execa";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Navigate up from tests dir to project root (7 levels)
const CLI_PATH = join(__dirname, "../../../../../../../bin/spx.js");

/** Isolated fixture project that passes validation */
const CLEAN_FIXTURE = join(__dirname, "../../../../../../../tests/fixtures/projects/clean-project");

/** Pattern matching step numbering like [1/4] */
const STEP_NUMBER_PATTERN = /\[\d+\/\d+\]/;

/** Pattern matching timing like (500ms) or (1.5s) */
const TIMING_PATTERN = /\(\d+(\.\d)?m?s\)/;

/** Pattern matching summary line like "✓ Validation passed (2.7s total)" or "✗ Validation failed" */
const SUMMARY_PATTERN = /[✓✗] Validation (passed|failed) \(\d+(\.\d)?s total\)/;

describe("Validation CLI Output Format", () => {
  // Cache the result to avoid running validation multiple times
  let validationResult: Awaited<ReturnType<typeof execa>>;
  let quietResult: Awaited<ReturnType<typeof execa>>;

  beforeAll(async () => {
    // Run validation all once against isolated fixture and cache the result (ADR-021)
    validationResult = await execa("node", [CLI_PATH, "validation", "all"], {
      cwd: CLEAN_FIXTURE,
      reject: false,
    });

    // Run with --quiet once
    quietResult = await execa("node", [CLI_PATH, "validation", "all", "--quiet"], {
      cwd: CLEAN_FIXTURE,
      reject: false,
    });
  }, 60000); // 60 second timeout for beforeAll

  describe("Step numbering and timing", () => {
    it("GIVEN spx validation all WHEN running THEN output includes step numbers [1/5] through [5/5]", () => {
      // Test output format regardless of pass/fail status
      expect(validationResult.stdout).toMatch(STEP_NUMBER_PATTERN);
      expect(validationResult.stdout).toContain("[1/5]");
      expect(validationResult.stdout).toContain("[5/5]");
    });

    it("GIVEN spx validation all WHEN running THEN output includes timing for each step", () => {
      expect(validationResult.stdout).toMatch(TIMING_PATTERN);
    });
  });

  describe("Summary line", () => {
    it("GIVEN spx validation all WHEN running THEN shows summary with total time", () => {
      // Test format regardless of pass/fail - could be "passed" or "failed"
      expect(validationResult.stdout).toMatch(SUMMARY_PATTERN);
      expect(validationResult.stdout).toMatch(/\(\d+(\.\d)?s total\)/);
    });
  });

  describe("Quiet mode", () => {
    it("GIVEN --quiet flag WHEN running THEN suppresses step output and summary", () => {
      expect(quietResult.stdout).not.toMatch(STEP_NUMBER_PATTERN);
      expect(quietResult.stdout).not.toMatch(SUMMARY_PATTERN);
    });
  });
});

describe("Individual command timing", () => {
  it(
    "GIVEN spx validation typescript WHEN running THEN output contains TypeScript info",
    async () => {
      // ADR-021: Use isolated fixture
      const result = await execa("node", [CLI_PATH, "validation", "typescript"], {
        cwd: CLEAN_FIXTURE,
        reject: false,
      });

      // Individual commands show their output
      expect(result.stdout).toContain("TypeScript");
    },
    15000,
  ); // 15 second timeout
});
