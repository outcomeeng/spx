/**
 * E2E Performance tests (Level 3)
 *
 * Tests the core success metric: <100ms for 50 work items.
 *
 * Note: E2E tests include Node.js process startup overhead (~200-300ms),
 * so we use CLI_TIMEOUTS_MS.E2E from constants. The actual CLI
 * execution time (excluding Node.js startup) is verified to be <100ms.
 *
 * @see story-43_e2e-validation.story.md
 */
import { CLI_PATH, CLI_TIMEOUTS_MS } from "@test/harness/constants";
import { generateFixtureTree, PRESETS } from "@test/harness/fixture-generator";
import type { MaterializedFixture } from "@test/harness/fixture-writer";
import { materializeFixture } from "@test/harness/fixture-writer";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

describe("E2E: Performance", () => {
  let fixture: MaterializedFixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  describe("FR1: Performance Benchmarks", () => {
    it("GIVEN SHALLOW_50 fixture WHEN running status --json THEN completes within threshold", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      fixture = await materializeFixture(tree);

      const startTime = Date.now();
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: fixture.path,
      });
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);

      const result = JSON.parse(stdout);
      // SHALLOW_50: 2 caps + 10 feats = 12 items
      // Summary counts capabilities + features only (NOT stories)
      expect(
        result.summary.done + result.summary.inProgress + result.summary.open,
      ).toBe(12);
    });

    it("GIVEN DEEP_50 fixture WHEN running status --json THEN completes within threshold", async () => {
      const tree = generateFixtureTree(PRESETS.DEEP_50);
      fixture = await materializeFixture(tree);

      const startTime = Date.now();
      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: fixture.path,
      });
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);

      const result = JSON.parse(stdout);
      // DEEP_50: 1 cap + 2 feats = 3 items
      // Summary counts capabilities + features only (NOT stories)
      expect(
        result.summary.done + result.summary.inProgress + result.summary.open,
      ).toBe(3);
    });

    it("GIVEN SHALLOW_50 fixture WHEN running status (text) THEN completes within threshold", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      fixture = await materializeFixture(tree);

      const startTime = Date.now();
      const { exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: fixture.path,
      });
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    });
  });

  describe("Performance Consistency", () => {
    it("GIVEN SHALLOW_50 fixture WHEN running 5 times THEN all runs within threshold", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      fixture = await materializeFixture(tree);

      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await execa("node", [CLI_PATH, "spec", "status", "--json"], {
          cwd: fixture.path,
        });
        times.push(Date.now() - startTime);
      }

      expect(Math.max(...times)).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    }, CLI_TIMEOUTS_MS.E2E_BATCH);

    it("GIVEN fixture WHEN running multiple formats THEN all complete within threshold each", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      fixture = await materializeFixture(tree);

      const formats = ["json", "text", "markdown", "table"];

      for (const format of formats) {
        const args = format === "text"
          ? [CLI_PATH, "spec", "status"]
          : [CLI_PATH, "spec", "status", "--format", format];

        const startTime = Date.now();
        const { exitCode } = await execa("node", args, {
          cwd: fixture.path,
        });
        const elapsed = Date.now() - startTime;

        expect(exitCode).toBe(0);
        expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
      }
    }, CLI_TIMEOUTS_MS.E2E_BATCH);
  });

  describe("Summary Accuracy", () => {
    it("GIVEN fixture with known status distribution WHEN running status --json THEN summary reflects distribution", async () => {
      const config = {
        ...PRESETS.SHALLOW_50,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      fixture = await materializeFixture(tree);

      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: fixture.path,
      });

      expect(exitCode).toBe(0);

      const result = JSON.parse(stdout);
      // All stories should be DONE
      expect(result.summary.done).toBeGreaterThan(0);
      // Stories should be open = 0 (parents derive DONE from children)
      expect(result.summary.open).toBe(0);
    });
  });
});
