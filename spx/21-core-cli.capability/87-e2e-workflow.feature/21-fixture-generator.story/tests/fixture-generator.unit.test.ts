/**
 * Unit tests for fixture generator (Level 1)
 *
 * Tests pure functions with no I/O or external dependencies.
 *
 * @see story-21_fixture-generator.story.md
 */
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";
import {
  collectStatuses,
  countNodes,
  type FixtureConfig,
  type FixtureNode,
  generateFixtureTree,
  PRESETS,
} from "@testing/harnesses/fixture-generator";
import { describe, expect, it } from "vitest";

describe("generateFixtureTree", () => {
  describe("FR1: Tree Generation", () => {
    it("GIVEN MINIMAL preset WHEN generating THEN produces 3 nodes (1 cap + 1 feat + 1 story)", () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);

      const count = countNodes(tree);
      expect(count).toBe(3);
    });

    it("GIVEN SHALLOW_50 preset WHEN generating THEN produces >= 50 nodes", () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);

      // 2 caps + 10 feats + 40 stories = 52
      const count = countNodes(tree);
      expect(count).toBeGreaterThanOrEqual(50);
    });

    it("GIVEN DEEP_50 preset WHEN generating THEN produces >= 50 nodes", () => {
      const tree = generateFixtureTree(PRESETS.DEEP_50);

      // 1 cap + 2 feats + 48 stories = 51
      const count = countNodes(tree);
      expect(count).toBeGreaterThanOrEqual(50);
    });

    it("GIVEN FAN_10_LEVEL_3 preset WHEN generating THEN produces correct hierarchy", () => {
      const tree = generateFixtureTree(PRESETS.FAN_10_LEVEL_3);

      // 1 cap + 3 feats + 6 stories = 10
      const count = countNodes(tree);
      expect(count).toBeGreaterThanOrEqual(10);

      // Verify 3-level hierarchy
      expect(tree.nodes).toHaveLength(1);
      const cap = tree.nodes[0];
      const features = cap.children.filter((c) => c.kind === WORK_ITEM_KINDS[1]);
      expect(features).toHaveLength(3);
      for (const feat of features) {
        expect(feat.children.filter((c) => c.kind === WORK_ITEM_KINDS[2])).toHaveLength(2);
      }
    });
  });

  describe("FR2: BSP Number Generation", () => {
    it("GIVEN config WHEN generating THEN capability numbers are in [10, 99]", () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);

      for (const cap of tree.nodes) {
        expect(cap.number).toBeGreaterThanOrEqual(10);
        expect(cap.number).toBeLessThanOrEqual(99);
      }
    });

    it("GIVEN config WHEN generating THEN feature numbers are in [10, 99]", () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);

      for (const cap of tree.nodes) {
        for (const child of cap.children) {
          if (child.kind === WORK_ITEM_KINDS[1]) {
            expect(child.number).toBeGreaterThanOrEqual(10);
            expect(child.number).toBeLessThanOrEqual(99);
          }
        }
      }
    });

    it("GIVEN config WHEN generating THEN story numbers are in [10, 99]", () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);

      for (const cap of tree.nodes) {
        for (const feat of cap.children.filter((c) => c.kind === WORK_ITEM_KINDS[1])) {
          for (const story of feat.children.filter((c) => c.kind === WORK_ITEM_KINDS[2])) {
            expect(story.number).toBeGreaterThanOrEqual(10);
            expect(story.number).toBeLessThanOrEqual(99);
          }
        }
      }
    });

    it("GIVEN multiple items WHEN generating THEN numbers are evenly distributed", () => {
      const tree = generateFixtureTree(PRESETS.SHALLOW_50);

      // With 5 features per capability, numbers should be spaced roughly 15-18 apart
      const cap = tree.nodes[0];
      const featNumbers = cap.children
        .filter((c) => c.kind === WORK_ITEM_KINDS[1])
        .map((f) => f.number)
        .sort((a, b) => a - b);

      // Check that they're not all clustered together
      const range = featNumbers[featNumbers.length - 1] - featNumbers[0];
      expect(range).toBeGreaterThan(30); // Should span a good portion of [10, 99]
    });
  });

  describe("FR3: Seed Reproducibility", () => {
    it("GIVEN same seed WHEN generating twice THEN produces identical trees", () => {
      const config: FixtureConfig = { ...PRESETS.MINIMAL, seed: 12345 };

      const tree1 = generateFixtureTree(config);
      const tree2 = generateFixtureTree(config);

      expect(tree1.nodes[0].slug).toBe(tree2.nodes[0].slug);
      expect(tree1.nodes[0].number).toBe(tree2.nodes[0].number);
      expect(tree1.nodes[0].status).toBe(tree2.nodes[0].status);
    });

    it("GIVEN different seeds WHEN generating THEN produces different slugs", () => {
      const config1: FixtureConfig = { ...PRESETS.MINIMAL, seed: 12345 };
      const config2: FixtureConfig = { ...PRESETS.MINIMAL, seed: 54321 };

      const tree1 = generateFixtureTree(config1);
      const tree2 = generateFixtureTree(config2);

      // Slugs should be different (very high probability)
      expect(tree1.nodes[0].slug).not.toBe(tree2.nodes[0].slug);
    });
  });

  describe("Status Distribution", () => {
    it("GIVEN 100% done WHEN generating THEN all stories are DONE", () => {
      const config: FixtureConfig = {
        ...PRESETS.SHALLOW_50,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 42,
      };

      const tree = generateFixtureTree(config);
      const statuses = collectStatuses(tree);

      // All stories should be DONE
      const stories = countStories(tree);
      expect(statuses.done).toBeGreaterThanOrEqual(stories);
    });

    it("GIVEN 100% open WHEN generating THEN all stories are OPEN", () => {
      const config: FixtureConfig = {
        ...PRESETS.SHALLOW_50,
        statusDistribution: { done: 0, inProgress: 0, open: 1 },
        seed: 42,
      };

      const tree = generateFixtureTree(config);

      // Check that all story statuses are OPEN
      const stories = getAllStories(tree);
      for (const story of stories) {
        expect(story.status).toBe(WORK_ITEM_STATUSES[0]);
      }
    });

    it("GIVEN 50/30/20 distribution WHEN generating THEN approximates ratios (within 25%)", () => {
      const config: FixtureConfig = {
        ...PRESETS.SHALLOW_50,
        statusDistribution: { done: 0.5, inProgress: 0.3, open: 0.2 },
        seed: 42,
      };

      const tree = generateFixtureTree(config);
      const stories = getAllStories(tree);
      const total = stories.length;

      const done = stories.filter((s) => s.status === WORK_ITEM_STATUSES[2]).length;
      const inProgress = stories.filter((s) => s.status === WORK_ITEM_STATUSES[1]).length;

      // Allow 25% variance due to randomness
      expect(done / total).toBeGreaterThan(0.25);
      expect(done / total).toBeLessThan(0.75);
      expect(inProgress / total).toBeGreaterThan(0.05);
      expect(inProgress / total).toBeLessThan(0.55);
    });
  });

  describe("Slug Validation", () => {
    it("GIVEN config WHEN generating THEN slugs match /^[a-z][a-z0-9-]*$/", () => {
      const tree = generateFixtureTree({ ...PRESETS.SHALLOW_50, seed: 42 });

      function validateSlugs(nodes: FixtureNode[]): void {
        for (const node of nodes) {
          expect(node.slug).toMatch(/^[a-z][a-z0-9-]*$/);
          validateSlugs(node.children);
        }
      }

      validateSlugs(tree.nodes);
    });

    it("GIVEN faker WHEN generating THEN slugs are URL-safe", () => {
      const tree = generateFixtureTree({ ...PRESETS.SHALLOW_50, seed: 123 });

      function checkUrlSafe(nodes: FixtureNode[]): void {
        for (const node of nodes) {
          // URL-safe: no spaces, special chars, or uppercase
          expect(node.slug).not.toMatch(/\s/);
          expect(node.slug).not.toMatch(/[^a-z0-9-]/);
          expect(node.slug).toBe(node.slug.toLowerCase());
          checkUrlSafe(node.children);
        }
      }

      checkUrlSafe(tree.nodes);
    });
  });

  describe("Parent Status Derivation", () => {
    it("GIVEN all DONE children WHEN generating THEN parent is DONE", () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 1, inProgress: 0, open: 0 },
        seed: 42,
      };

      const tree = generateFixtureTree(config);
      const cap = tree.nodes[0];
      const feat = cap.children.find((c) => c.kind === WORK_ITEM_KINDS[1]);

      expect(feat?.status).toBe(WORK_ITEM_STATUSES[2]);
      expect(cap.status).toBe(WORK_ITEM_STATUSES[2]);
    });

    it("GIVEN all OPEN children WHEN generating THEN parent is OPEN", () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        statusDistribution: { done: 0, inProgress: 0, open: 1 },
        seed: 42,
      };

      const tree = generateFixtureTree(config);
      const cap = tree.nodes[0];

      expect(cap.status).toBe(WORK_ITEM_STATUSES[0]);
    });

    it("GIVEN mixed children WHEN generating THEN parent is IN_PROGRESS", () => {
      // Use a larger sample to ensure mixed statuses
      const config: FixtureConfig = {
        ...PRESETS.FAN_10_LEVEL_3,
        statusDistribution: { done: 0.5, inProgress: 0, open: 0.5 },
        seed: 999,
      };

      const tree = generateFixtureTree(config);
      const cap = tree.nodes[0];
      const features = cap.children.filter((c) => c.kind === WORK_ITEM_KINDS[1]);

      // At least one feature should have mixed children -> IN_PROGRESS
      // or the capability itself should be IN_PROGRESS due to mixed features
      const hasInProgress = cap.status === WORK_ITEM_STATUSES[1]
        || features.some((f) => f.status === WORK_ITEM_STATUSES[1]);
      expect(hasInProgress).toBe(true);
    });
  });

  describe("ADR Generation", () => {
    it("GIVEN adrsPerCapability = 1 WHEN generating THEN creates 1 ADR per capability", () => {
      const tree = generateFixtureTree(PRESETS.MINIMAL);

      for (const cap of tree.nodes) {
        const adrs = cap.children.filter((c) => c.kind === "adr");
        expect(adrs).toHaveLength(1);
      }
    });

    it("GIVEN adrsPerCapability = 2 WHEN generating THEN creates 2 ADRs per capability", () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        adrsPerCapability: 2,
      };

      const tree = generateFixtureTree(config);

      for (const cap of tree.nodes) {
        const adrs = cap.children.filter((c) => c.kind === "adr");
        expect(adrs).toHaveLength(2);
      }
    });

    it("GIVEN ADRs WHEN generating THEN ADR numbers are sequential (1, 2, ...)", () => {
      const config: FixtureConfig = {
        ...PRESETS.MINIMAL,
        adrsPerCapability: 3,
      };

      const tree = generateFixtureTree(config);
      const adrs = tree.nodes[0].children.filter((c) => c.kind === "adr");

      expect(adrs.map((a) => a.number)).toEqual([1, 2, 3]);
    });
  });
});

describe("PRESETS", () => {
  it("MINIMAL has 1 capability, 1 feature, 1 story", () => {
    expect(PRESETS.MINIMAL.capabilities).toBe(1);
    expect(PRESETS.MINIMAL.featuresPerCapability).toBe(1);
    expect(PRESETS.MINIMAL.storiesPerFeature).toBe(1);
  });

  it("SHALLOW_50 produces wide, shallow tree (>= 50 items)", () => {
    const { capabilities: c, featuresPerCapability: f, storiesPerFeature: s } = PRESETS.SHALLOW_50;
    const total = c + c * f + c * f * s;
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it("DEEP_50 produces narrow, deep tree (>= 50 items)", () => {
    const { capabilities: c, featuresPerCapability: f, storiesPerFeature: s } = PRESETS.DEEP_50;
    const total = c + c * f + c * f * s;
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it("FAN_10_LEVEL_3 produces 3-level hierarchy (>= 10 items)", () => {
    const { capabilities: c, featuresPerCapability: f, storiesPerFeature: s } = PRESETS.FAN_10_LEVEL_3;
    const total = c + c * f + c * f * s;
    expect(total).toBeGreaterThanOrEqual(10);
  });

  it("All presets have valid status distributions summing to ~1.0", () => {
    for (const [_name, preset] of Object.entries(PRESETS)) {
      const sum = preset.statusDistribution.done
        + preset.statusDistribution.inProgress
        + preset.statusDistribution.open;
      expect(sum).toBeCloseTo(1.0, 1);
    }
  });
});

describe("countNodes", () => {
  it("GIVEN tree WHEN counting THEN excludes ADR nodes", () => {
    const config: FixtureConfig = {
      ...PRESETS.MINIMAL,
      adrsPerCapability: 5,
    };

    const tree = generateFixtureTree(config);
    const count = countNodes(tree);

    // Should be 3 (1 cap + 1 feat + 1 story), not 8
    expect(count).toBe(3);
  });
});

describe("collectStatuses", () => {
  it("GIVEN tree WHEN collecting THEN returns correct counts", () => {
    const config: FixtureConfig = {
      ...PRESETS.MINIMAL,
      statusDistribution: { done: 1, inProgress: 0, open: 0 },
      seed: 42,
    };

    const tree = generateFixtureTree(config);
    const statuses = collectStatuses(tree);

    // All should be DONE
    expect(statuses.done).toBeGreaterThan(0);
    expect(statuses.inProgress).toBe(0);
    expect(statuses.open).toBe(0);
    expect(statuses.total).toBe(statuses.done);
  });
});

// Helper functions for tests

function countStories(tree: { nodes: FixtureNode[] }): number {
  let count = 0;

  function traverse(nodes: FixtureNode[]): void {
    for (const node of nodes) {
      if (node.kind === WORK_ITEM_KINDS[2]) {
        count++;
      }
      traverse(node.children);
    }
  }

  traverse(tree.nodes);
  return count;
}

function getAllStories(tree: { nodes: FixtureNode[] }): FixtureNode[] {
  const stories: FixtureNode[] = [];

  function traverse(nodes: FixtureNode[]): void {
    for (const node of nodes) {
      if (node.kind === WORK_ITEM_KINDS[2]) {
        stories.push(node);
      }
      traverse(node.children);
    }
  }

  traverse(tree.nodes);
  return stories;
}
