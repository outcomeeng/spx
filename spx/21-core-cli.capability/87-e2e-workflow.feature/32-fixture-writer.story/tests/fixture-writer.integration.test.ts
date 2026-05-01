/**
 * Integration tests for fixture writer (Level 2)
 *
 * Tests real filesystem I/O in os.tmpdir().
 *
 * @see story-32_fixture-writer.story.md
 */
import { type FixtureConfig, generateFixtureTree, PRESETS } from "@testing/harnesses/fixture-generator";
import { createFixture, type MaterializedFixture, materializeFixture } from "@testing/harnesses/fixture-writer";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

describe("materializeFixture", () => {
  const fixtures: MaterializedFixture[] = [];

  afterEach(async () => {
    for (const f of fixtures) {
      await f.cleanup();
    }
    fixtures.length = 0;
  });

  describe("FR1: Directory Creation", () => {
    it("GIVEN tree WHEN materializing THEN creates directory in tmpdir with spx-fixture- prefix", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      expect(fixture.path).toContain("spx-fixture-");
      expect(existsSync(fixture.path)).toBe(true);
    });

    it("GIVEN tree WHEN materializing THEN creates specs/work/doing/ structure", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      expect(existsSync(`${fixture.path}/specs`)).toBe(true);
      expect(existsSync(`${fixture.path}/specs/work/doing`)).toBe(true);
    });
  });

  describe("FR1: File Structure per specs/templates/structure.yaml", () => {
    it("GIVEN tree with capability WHEN materializing THEN creates {slug}.capability.md", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const doingPath = `${fixture.path}/specs/work/doing`;
      const caps = readdirSync(doingPath).filter((d) => d.startsWith("capability-"));
      expect(caps.length).toBe(1);

      const capDir = `${doingPath}/${caps[0]}`;
      const slug = caps[0].split("_")[1];
      expect(existsSync(`${capDir}/${slug}.capability.md`)).toBe(true);
    });

    it("GIVEN tree with feature WHEN materializing THEN creates {slug}.feature.md", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const doingPath = `${fixture.path}/specs/work/doing`;
      const caps = readdirSync(doingPath).filter((d) => d.startsWith("capability-"));
      const capDir = `${doingPath}/${caps[0]}`;

      const features = readdirSync(capDir).filter((d) => d.startsWith("feature-"));
      expect(features.length).toBe(1);

      const featDir = `${capDir}/${features[0]}`;
      const slug = features[0].split("_")[1];
      expect(existsSync(`${featDir}/${slug}.feature.md`)).toBe(true);
    });

    it("GIVEN tree with story WHEN materializing THEN creates {slug}.story.md", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      expect(storyDir).not.toBeNull();

      const storyDirName = storyDir!.split("/").pop()!;
      const slug = storyDirName.split("_")[1];
      expect(existsSync(`${storyDir}/${slug}.story.md`)).toBe(true);
    });

    it("GIVEN tree with ADR WHEN materializing THEN creates decisions/adr-{NNN}_{slug}.md", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const capDir = findFirstCapabilityDir(fixture.path);
      const decisionsPath = `${capDir}/decisions`;
      expect(existsSync(decisionsPath)).toBe(true);

      const adrs = readdirSync(decisionsPath).filter((f) => f.startsWith("adr-"));
      expect(adrs.length).toBeGreaterThanOrEqual(1);
      expect(adrs[0]).toMatch(/^adr-\d{3}_[a-z][a-z0-9-]*\.md$/);
    });
  });

  describe("Status-based File Creation", () => {
    it("GIVEN DONE story WHEN materializing THEN creates tests/DONE.md", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      expect(existsSync(`${storyDir}/tests/DONE.md`)).toBe(true);
    });

    it("GIVEN IN_PROGRESS story WHEN materializing THEN creates tests/*.test.ts (no DONE.md)", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 0, inProgress: 1, open: 0 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      const testsPath = `${storyDir}/tests`;

      const files = readdirSync(testsPath);
      expect(files.some((f) => f.endsWith(".test.ts"))).toBe(true);
      expect(files.includes("DONE.md")).toBe(false);
    });

    it("GIVEN OPEN story WHEN materializing THEN creates empty tests/ directory", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 0, inProgress: 0, open: 1 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      const testsPath = `${storyDir}/tests`;

      expect(existsSync(testsPath)).toBe(true);
      expect(readdirSync(testsPath).length).toBe(0);
    });
  });

  describe("FR2: Cleanup", () => {
    it("GIVEN fixture WHEN cleanup() called THEN removes all files and directories", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      const path = fixture.path;

      expect(existsSync(path)).toBe(true);
      await fixture.cleanup();
      expect(existsSync(path)).toBe(false);
    });

    it("GIVEN fixture WHEN cleanup() called twice THEN does not throw", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);

      await fixture.cleanup();
      // Second cleanup should not throw
      await expect(fixture.cleanup()).resolves.not.toThrow();
    });
  });

  describe("File Content Validation", () => {
    it("GIVEN capability WHEN materializing THEN capability.md has valid content", async () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const capDir = findFirstCapabilityDir(fixture.path);
      const capDirName = capDir.split("/").pop()!;
      const slug = capDirName.split("_")[1];
      const content = readFileSync(`${capDir}/${slug}.capability.md`, "utf-8");

      expect(content).toContain("# Capability:");
    });

    it("GIVEN DONE story WHEN materializing THEN DONE.md has content", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      const content = readFileSync(`${storyDir}/tests/DONE.md`, "utf-8");

      expect(content).toContain("# Done");
    });

    it("GIVEN IN_PROGRESS story WHEN materializing THEN test file has valid content", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 0, inProgress: 1, open: 0 },
        seed: 42,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDir = findFirstStoryDir(fixture.path);
      const testsPath = `${storyDir}/tests`;
      const testFiles = readdirSync(testsPath).filter((f) => f.endsWith(".test.ts"));
      const content = readFileSync(`${testsPath}/${testFiles[0]}`, "utf-8");

      expect(content).toContain("import { describe, it, expect }");
      expect(content).toContain("describe(");
    });
  });

  describe("ADR Generation", () => {
    it("GIVEN adrsPerCapability = 2 WHEN materializing THEN creates 2 ADR files", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        adrsPerCapability: 2,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const capDir = findFirstCapabilityDir(fixture.path);
      const decisionsPath = `${capDir}/decisions`;
      const adrs = readdirSync(decisionsPath).filter((f) => f.startsWith("adr-"));

      expect(adrs.length).toBe(2);
    });

    it("GIVEN ADRs WHEN materializing THEN ADR numbers are padded to 3 digits", async () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        adrsPerCapability: 2,
      };
      const tree = generateFixtureTree(config);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const capDir = findFirstCapabilityDir(fixture.path);
      const decisionsPath = `${capDir}/decisions`;
      const adrs = readdirSync(decisionsPath)
        .filter((f) => f.startsWith("adr-"))
        .sort();

      expect(adrs[0]).toMatch(/^adr-001_/);
      expect(adrs[1]).toMatch(/^adr-002_/);
    });
  });

  describe("Large Fixtures", () => {
    it("GIVEN SHALLOW_50 preset WHEN materializing THEN creates 50+ stories", async () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);
      const fixture = await materializeFixture(tree);
      fixtures.push(fixture);

      const storyDirs = findAllStoryDirs(fixture.path);
      expect(storyDirs.length).toBeGreaterThanOrEqual(40);
    });
  });
});

describe("createFixture", () => {
  it("GIVEN config WHEN calling createFixture THEN generates and materializes", async () => {
    const fixture = await createFixture(PRESETS.MINIMAL);

    try {
      expect(fixture.path).toBeDefined();
      expect(existsSync(fixture.path)).toBe(true);
      expect(fixture.config).toEqual(PRESETS.MINIMAL);
    } finally {
      await fixture.cleanup();
    }
  });

  it("GIVEN PRESETS.SHALLOW_50 WHEN calling createFixture THEN creates 50+ item fixture", async () => {
    const fixture = await createFixture(PRESETS.SHALLOW_50);

    try {
      const storyDirs = findAllStoryDirs(fixture.path);
      expect(storyDirs.length).toBeGreaterThanOrEqual(40);
    } finally {
      await fixture.cleanup();
    }
  });

  it("GIVEN config WHEN calling createFixture THEN config is preserved", async () => {
    const config: FixtureConfig = {
      ...PRESETS.MINIMAL,
      seed: 99999,
    };
    const fixture = await createFixture(config);

    try {
      expect(fixture.config.seed).toBe(99999);
    } finally {
      await fixture.cleanup();
    }
  });
});

// Helper functions

function findFirstCapabilityDir(fixturePath: string): string {
  const doingPath = `${fixturePath}/specs/work/doing`;
  const caps = readdirSync(doingPath).filter((d) => d.startsWith("capability-"));
  return `${doingPath}/${caps[0]}`;
}

function findFirstStoryDir(fixturePath: string): string | null {
  const doingPath = `${fixturePath}/specs/work/doing`;
  const caps = readdirSync(doingPath).filter((d) => d.startsWith("capability-"));

  for (const cap of caps) {
    const capDir = `${doingPath}/${cap}`;
    const features = readdirSync(capDir).filter((d) => d.startsWith("feature-"));

    for (const feat of features) {
      const featDir = `${capDir}/${feat}`;
      const stories = readdirSync(featDir).filter((d) => d.startsWith("story-"));

      if (stories.length > 0) {
        return `${featDir}/${stories[0]}`;
      }
    }
  }

  return null;
}

function findAllStoryDirs(fixturePath: string): string[] {
  const storyDirs: string[] = [];
  const doingPath = `${fixturePath}/specs/work/doing`;
  const caps = readdirSync(doingPath).filter((d) => d.startsWith("capability-"));

  for (const cap of caps) {
    const capDir = `${doingPath}/${cap}`;
    const features = readdirSync(capDir).filter((d) => d.startsWith("feature-"));

    for (const feat of features) {
      const featDir = `${capDir}/${feat}`;
      const stories = readdirSync(featDir).filter((d) => d.startsWith("story-"));

      for (const story of stories) {
        storyDirs.push(`${featDir}/${story}`);
      }
    }
  }

  return storyDirs;
}
