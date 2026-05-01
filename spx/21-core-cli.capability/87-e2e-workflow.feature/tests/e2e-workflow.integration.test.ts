/**
 * Feature 87: E2E Workflow Integration Tests
 *
 * Cross-story integration tests verifying the complete fixture
 * generation → materialization → CLI verification workflow.
 *
 * Tests at Level 2+3: Real filesystem + CLI execution.
 */
import { WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";
import { CLI_PATH, CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import {
  countNodes,
  type FixtureConfig,
  generateFixtureTree,
  PRESETS,
} from "@testing/harnesses/fixture-generator";
import { createFixture, type MaterializedFixture, materializeFixture } from "@testing/harnesses/fixture-writer";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

describe("Feature 87: E2E Workflow Integration", () => {
  let fixture: MaterializedFixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  describe("Story Integration: generator → writer → CLI", () => {
    it("GIVEN MINIMAL preset WHEN full workflow THEN CLI reads fixture correctly", async () => {
      // Story 21: Generate tree
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      expect(countNodes(tree)).toBe(3); // 1 cap + 1 feat + 1 story

      // Story 32: Materialize to filesystem
      fixture = await materializeFixture(tree);
      expect(fixture.path).toContain("spx-fixture-");

      // Story 43: CLI verification
      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );

      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.capabilities.length).toBe(1);
      expect(result.capabilities[0].features.length).toBe(1);
      expect(result.capabilities[0].features[0].stories.length).toBe(1);
    });

    it("GIVEN each PRESET WHEN full workflow THEN CLI returns valid JSON", async () => {
      for (const [_name, preset] of Object.entries(PRESETS)) {
        const tree = generateFixtureTree(preset);
        fixture = await materializeFixture(tree);

        const { stdout, exitCode } = await execa(
          "node",
          [CLI_PATH, "spec", "status", "--json"],
          { cwd: fixture.path },
        );

        expect(exitCode).toBe(0);
        expect(() => JSON.parse(stdout)).not.toThrow();

        const result = JSON.parse(stdout);
        expect(result.capabilities).toBeInstanceOf(Array);
        expect(result.capabilities.length).toBe(preset.capabilities);

        await fixture.cleanup();
        fixture = null;
      }
    }, CLI_TIMEOUTS_MS.E2E_BATCH);

    it("GIVEN createFixture convenience wrapper WHEN calling THEN works end-to-end", async () => {
      // Using the convenience wrapper combines story 21 + 32
      fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

      // Story 43: CLI verification
      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );

      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.capabilities.length).toBe(1);
      expect(result.capabilities[0].features.length).toBe(3);
    });
  });

  describe("Comprehensive E2E", () => {
    it("GIVEN SHALLOW_50 WHEN full workflow THEN CLI completes within threshold", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      fixture = await materializeFixture(tree);

      const startTime = Date.now();
      const { exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    });

    it("GIVEN seeded config WHEN regenerating THEN produces identical fixtures", async () => {
      const config: FixtureConfig = { ...PRESETS.MINIMAL, seed: 42 };

      // First generation
      const tree1 = generateFixtureTree(config);
      fixture = await materializeFixture(tree1);
      const { stdout: out1 } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const result1 = JSON.parse(out1);
      await fixture.cleanup();

      // Second generation with same seed
      const tree2 = generateFixtureTree(config);
      fixture = await materializeFixture(tree2);
      const { stdout: out2 } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const result2 = JSON.parse(out2);

      // Slugs should match (seeded faker)
      expect(result1.capabilities[0].slug).toBe(result2.capabilities[0].slug);
    });
  });

  describe("Status Distribution Verification", () => {
    it("GIVEN 100% DONE distribution WHEN full workflow THEN all items show DONE", async () => {
      const config: FixtureConfig = {
        ...PRESETS.FAN_10_LEVEL_3,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 123,
      };

      const tree = generateFixtureTree(config);
      fixture = await materializeFixture(tree);

      const { stdout } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const result = JSON.parse(stdout);

      // All stories should have DONE status
      for (const cap of result.capabilities) {
        for (const feat of cap.features) {
          for (const story of feat.stories) {
            expect(story.status).toBe(WORK_ITEM_STATUSES[2]);
          }
        }
      }

      // Summary should have all DONE (caps + features)
      expect(result.summary.inProgress).toBe(0);
      expect(result.summary.open).toBe(0);
    });

    it("GIVEN 100% OPEN distribution WHEN full workflow THEN all items show OPEN", async () => {
      const config: FixtureConfig = {
        ...PRESETS.FAN_10_LEVEL_3,
        statusDistribution: { done: 0, inProgress: 0, open: 1 },
        seed: 456,
      };

      const tree = generateFixtureTree(config);
      fixture = await materializeFixture(tree);

      const { stdout } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const result = JSON.parse(stdout);

      // All stories should have OPEN status
      for (const cap of result.capabilities) {
        for (const feat of cap.features) {
          for (const story of feat.stories) {
            expect(story.status).toBe(WORK_ITEM_STATUSES[0]);
          }
        }
      }

      // Summary should have all OPEN (caps + features)
      expect(result.summary.done).toBe(0);
      expect(result.summary.inProgress).toBe(0);
    });
  });
});
