import { FIXTURES_PATH } from "@testing/fixtures";
import { CLI_PATH } from "@testing/harnesses/constants";
import { execa } from "execa";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("Spec Domain Integration", () => {
  describe("status command", () => {
    it("GIVEN fixture repo WHEN running spec status THEN outputs tree", async () => {
      // Given: Fixture repo with work items
      const cwd = join(FIXTURES_PATH, "repos/simple");

      // When: Running spec status command
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd,
      });

      // Then: Outputs tree with work items
      expect(exitCode).toBe(0);
      expect(stdout).toContain("capability-");
    });

    it("GIVEN fixture repo WHEN running spec status --json THEN outputs valid JSON", async () => {
      // Given: Fixture repo
      const cwd = join(FIXTURES_PATH, "repos/simple");

      // When: Running spec status --json
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd,
      });

      // Then: Outputs valid JSON
      expect(exitCode).toBe(0);

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("capabilities");
      expect(result).toHaveProperty("summary");
      expect(result.summary).toHaveProperty("done");
    });

    it("GIVEN empty repo WHEN running spec status THEN shows no work items", async () => {
      // Given: Empty repo (no specs directory)
      const cwd = join(FIXTURES_PATH, "repos/empty");

      // When: Running spec status
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd,
      });

      // Then: Shows no work items message
      expect(exitCode).toBe(0);
      expect(stdout).toContain("No work items found");
    });
  });

  describe("next command", () => {
    it("GIVEN fixture repo WHEN running spec next THEN finds next work item", async () => {
      // Given: Fixture repo with incomplete work items
      const cwd = join(FIXTURES_PATH, "repos/mixed");

      // When: Running spec next
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "next"], {
        cwd,
      });

      // Then: Finds and displays next work item
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Next work item:");
    });
  });

  describe("help text", () => {
    it("GIVEN spec domain WHEN requesting help THEN shows spec commands", async () => {
      // When: Requesting help for spec domain
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "--help"]);

      // Then: Shows spec commands
      expect(exitCode).toBe(0);
      expect(stdout).toContain("status");
      expect(stdout).toContain("Get project status");
      expect(stdout).toContain("next");
      expect(stdout).toContain("Find next work item");
    });
  });

  describe("error handling", () => {
    it("GIVEN invalid format WHEN running spec status THEN shows error", async () => {
      // Given: Fixture repo
      const cwd = join(FIXTURES_PATH, "repos/simple");

      // When: Running with invalid format
      const { stderr, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--format", "invalid"],
        {
          cwd,
          reject: false,
        },
      );

      // Then: Shows error message
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid format");
    });
  });
});
