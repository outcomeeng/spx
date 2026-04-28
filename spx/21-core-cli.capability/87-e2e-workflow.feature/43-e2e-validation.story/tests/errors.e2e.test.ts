/**
 * E2E Error handling tests (Level 3)
 *
 * Tests error scenarios are handled gracefully.
 *
 * @see story-43_e2e-validation.story.md
 */
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CLI_PATH, VERSION_FLAG } from "@test/harness/constants";

describe("E2E: Error Scenarios", () => {
  describe("FR3: Error Handling", () => {
    it("GIVEN directory without specs/ WHEN running status THEN exits 1 with error message", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "spx-test-"));

      try {
        const { exitCode, stderr } = await execa(
          "node",
          [CLI_PATH, "spec", "status"],
          { cwd: emptyDir, reject: false },
        );

        expect(exitCode).toBe(1);
        // CLI shows error about walking directory or missing specs
        expect(stderr.toLowerCase()).toMatch(/error|failed|no such file/i);
      } finally {
        await rm(emptyDir, { recursive: true });
      }
    });

    it("GIVEN invalid format option WHEN running status THEN exits 1 with format error", async () => {
      const { exitCode, stderr } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--format", "invalid"],
        { reject: false },
      );

      expect(exitCode).toBe(1);
      expect(stderr.toLowerCase()).toMatch(/invalid|format|must be one of/i);
    });

    it("GIVEN invalid command WHEN running spx THEN exits 1 with unknown command error", async () => {
      const { exitCode, stderr } = await execa(
        "node",
        [CLI_PATH, "notacommand"],
        { reject: false },
      );

      expect(exitCode).toBe(1);
      expect(stderr.toLowerCase()).toMatch(/unknown command|error/i);
    });
  });

  describe("Help and Version", () => {
    it("GIVEN --help flag WHEN running spx THEN exits 0 with usage info", async () => {
      const { exitCode, stdout } = await execa("node", [CLI_PATH, "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("spec");
    });

    it("GIVEN --version flag WHEN running spx THEN exits 0 with semver version", async () => {
      const { exitCode, stdout } = await execa("node", [CLI_PATH, VERSION_FLAG]);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it("GIVEN spec status --help WHEN running THEN shows status command help", async () => {
      const { exitCode, stdout } = await execa("node", [
        CLI_PATH,
        "spec",
        "status",
        "--help",
      ]);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain("status");
    });
  });

  describe("Edge Cases", () => {
    it("GIVEN empty specs/work/doing directory WHEN running status THEN shows no work items message", async () => {
      const testDir = await mkdtemp(join(tmpdir(), "spx-test-"));

      try {
        // Create specs/work/doing but leave it empty
        const { mkdir } = await import("node:fs/promises");
        await mkdir(join(testDir, "specs", "work", "doing"), { recursive: true });

        const { exitCode, stdout } = await execa(
          "node",
          [CLI_PATH, "spec", "status"],
          { cwd: testDir },
        );

        expect(exitCode).toBe(0);
        // CLI shows "No work items found" for empty specs
        expect(stdout.toLowerCase()).toContain("no work");
      } finally {
        await rm(testDir, { recursive: true });
      }
    });

    it("GIVEN no arguments WHEN running spx THEN shows help or default behavior", async () => {
      const { exitCode } = await execa("node", [CLI_PATH], { reject: false });

      // Should either show help (exit 0) or error about no command (exit 1)
      expect([0, 1]).toContain(exitCode);
    });
  });
});
