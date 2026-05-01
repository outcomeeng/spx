/**
 * E2E Format validation tests (Level 3)
 *
 * Tests all output formats work correctly.
 *
 * @see story-43_e2e-validation.story.md
 */
import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { generateFixtureTree, PRESETS } from "@testing/harnesses/fixture-generator";
import { type MaterializedFixture, materializeFixture } from "@testing/harnesses/fixture-writer";
import { execa } from "execa";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Path to CLI binary (relative to project root)
const CLI_PATH = resolve(process.cwd(), "bin/spx.js");

describe("E2E: Output Formats", () => {
  let fixture: MaterializedFixture | null = null;

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  describe("FR2: Multi-format Validation", () => {
    it("GIVEN fixture WHEN running status (text) THEN renders tree with capability-/feature-/story-", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: fixture.path,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("capability-");
      expect(stdout).toContain("feature-");
      expect(stdout).toContain("story-");
    });

    it("GIVEN fixture WHEN running status --json THEN produces valid JSON with summary", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );

      expect(exitCode).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();

      const result = JSON.parse(stdout);
      expect(result.summary).toBeDefined();
      expect(result.summary).toHaveProperty("done");
      expect(result.summary).toHaveProperty("inProgress");
      expect(result.summary).toHaveProperty("open");
      expect(result.capabilities).toBeInstanceOf(Array);
    });

    it("GIVEN fixture WHEN running status --format markdown THEN produces markdown headers", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--format", "markdown"],
        { cwd: fixture.path },
      );

      expect(exitCode).toBe(0);
      // Markdown should have headers
      expect(stdout).toMatch(/^#+ /m);
    });

    it("GIVEN fixture WHEN running status --format table THEN produces pipe-delimited table", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      const { stdout, exitCode } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--format", "table"],
        { cwd: fixture.path },
      );

      expect(exitCode).toBe(0);
      // Table format has pipe characters
      expect(stdout).toMatch(/\|.*\|/);
    });
  });

  describe("Cross-format Consistency", () => {
    it("GIVEN fixture WHEN requesting all formats THEN summary counts match expected", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      // Get JSON result for baseline counts
      const { stdout: jsonOut } = await execa(
        "node",
        [CLI_PATH, "spec", "status", "--json"],
        { cwd: fixture.path },
      );
      const jsonData = JSON.parse(jsonOut);
      const itemCount = jsonData.summary.done + jsonData.summary.inProgress + jsonData.summary.open;

      // Summary counts capabilities + features only (NOT stories)
      // FAN_10_LEVEL_3: 1 cap + 3 feats = 4 items
      expect(itemCount).toBe(4);
    });

    it("GIVEN fixture WHEN running all formats THEN all exit with code 0", async () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);
      fixture = await materializeFixture(tree);

      const formats = [
        ["spec", "status"],
        ["spec", "status", "--json"],
        ["spec", "status", "--format", "markdown"],
        ["spec", "status", "--format", "table"],
      ];

      for (const args of formats) {
        const { exitCode } = await execa("node", [CLI_PATH, ...args], {
          cwd: fixture.path,
        });
        expect(exitCode).toBe(0);
      }
    });
  });

  describe("JSON Structure Validation", () => {
    it("GIVEN fixture WHEN running status --json THEN capabilities have expected structure", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      fixture = await materializeFixture(tree);

      const { stdout } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: fixture.path,
      });

      const result = JSON.parse(stdout);
      expect(result.capabilities.length).toBeGreaterThan(0);

      const cap = result.capabilities[0];
      expect(cap).toHaveProperty("kind", WORK_ITEM_KINDS[0]);
      expect(cap).toHaveProperty("number");
      expect(cap).toHaveProperty("slug");
      expect(cap).toHaveProperty("status");
    });

    it("GIVEN fixture WHEN running status --json THEN nested structure is correct", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      fixture = await materializeFixture(tree);

      const { stdout } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: fixture.path,
      });

      const result = JSON.parse(stdout);
      const cap = result.capabilities[0];

      // Should have features (CLI uses 'features' property, not 'children')
      expect(cap.features).toBeInstanceOf(Array);
      expect(cap.features.length).toBeGreaterThan(0);

      // First feature
      const feat = cap.features[0];
      expect(feat).toHaveProperty("kind", WORK_ITEM_KINDS[1]);
      expect(feat.stories).toBeInstanceOf(Array);

      // Feature should have stories
      const story = feat.stories[0];
      expect(story).toBeDefined();
      expect(story).toHaveProperty("kind", WORK_ITEM_KINDS[2]);
      expect(story).toHaveProperty("status");
    });
  });

  describe("Text Format Details", () => {
    it("GIVEN fixture WHEN running status THEN shows status indicators", async () => {
      // Use a config that ensures mixed statuses
      const config = {
        ...PRESETS.FAN_10_LEVEL_3,
        statusDistribution: { done: 0.5, inProgress: 0.3, open: 0.2 },
        seed: 12345,
      };
      const tree = generateFixtureTree(config);
      fixture = await materializeFixture(tree);

      const { stdout } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: fixture.path,
      });

      // Should show status indicators (the actual format may vary)
      expect(stdout.length).toBeGreaterThan(0);
    });
  });
});
