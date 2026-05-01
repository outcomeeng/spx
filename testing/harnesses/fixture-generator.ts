/**
 * Fixture generator for E2E testing
 *
 * - generateFixtureTree(config) - Pure function to create tree structure
 * - PRESETS - Common configurations for testing
 */
import type { WorkItemKind, WorkItemStatus } from "@/lib/spec-legacy/types";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";
import { type DecisionKind, SPEC_TREE_ADR_KIND } from "@/lib/spec-tree/config";
import { faker } from "@faker-js/faker";

/**
 * Configuration for fixture generation
 */
export interface FixtureConfig {
  /** Number of capabilities to generate */
  capabilities: number;
  /** Number of features per capability */
  featuresPerCapability: number;
  /** Number of stories per feature */
  storiesPerFeature: number;
  /** Distribution of statuses (must sum to 1.0) */
  statusDistribution: { done: number; inProgress: number; open: number };
  /** Number of ADRs per capability (default: 1) */
  adrsPerCapability?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Node in the fixture tree
 */
export interface FixtureNode {
  /** Type of work item */
  kind: WorkItemKind | DecisionKind;
  /** BSP number (10-99) */
  number: number;
  /** URL-safe slug */
  slug: string;
  /** Status (only for capabilities, features, stories) */
  status?: WorkItemStatus;
  /** Child nodes */
  children: FixtureNode[];
}

/**
 * Generated fixture tree
 */
export interface FixtureTree {
  /** Root nodes (capabilities) */
  nodes: FixtureNode[];
  /** Original config for reference */
  config: FixtureConfig;
}

/**
 * Preset configurations for common testing scenarios
 */
export const PRESETS: Record<string, FixtureConfig> = {
  /** Minimal fixture: 1 cap, 1 feat, 1 story = 3 items */
  MINIMAL: {
    capabilities: 1,
    featuresPerCapability: 1,
    storiesPerFeature: 1,
    statusDistribution: { done: 0.33, inProgress: 0.34, open: 0.33 },
    adrsPerCapability: 1,
  },

  /** Shallow 50: 2 caps x 5 feats x 4 stories = 50+ items (wide, shallow) */
  SHALLOW_50: {
    capabilities: 2,
    featuresPerCapability: 5,
    storiesPerFeature: 4,
    statusDistribution: { done: 0.4, inProgress: 0.3, open: 0.3 },
    adrsPerCapability: 1,
  },

  /** Deep 50: 1 cap x 2 feats x 24 stories = 50+ items (narrow, deep) */
  DEEP_50: {
    capabilities: 1,
    featuresPerCapability: 2,
    storiesPerFeature: 24,
    statusDistribution: { done: 0.4, inProgress: 0.3, open: 0.3 },
    adrsPerCapability: 1,
  },

  /** Fan 10 Level 3: 1 cap x 3 feats x 2 stories = 10+ items (3-level hierarchy) */
  FAN_10_LEVEL_3: {
    capabilities: 1,
    featuresPerCapability: 3,
    storiesPerFeature: 2,
    statusDistribution: { done: 0.33, inProgress: 0.34, open: 0.33 },
    adrsPerCapability: 1,
  },
} as const;

/**
 * Generate a valid BSP number in range [10, 99]
 *
 * Uses BSP distribution for even spacing.
 *
 * @param index - Item index (0-based)
 * @param total - Total number of items
 * @returns BSP number in [10, 99]
 */
function generateBSPNumber(index: number, total: number): number {
  const MIN = 10;
  const MAX = 99;
  const range = MAX - MIN;

  if (total === 1) {
    // Single item: use initial distribution formula position
    return MIN + Math.floor(range / 2);
  }

  // Distribute evenly across range
  const spacing = range / (total + 1);
  return MIN + Math.floor(spacing * (index + 1));
}

/**
 * Generate a URL-safe slug from faker
 *
 * Ensures slug always starts with a letter (a-z).
 *
 * @returns Lowercase slug with hyphens, starting with a letter
 */
function generateSlug(): string {
  // Combine hacker words for realistic slugs
  const words = [faker.hacker.adjective(), faker.hacker.noun()];

  let slug = words
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Ensure slug starts with a letter (not a number)
  // If it starts with a number, prefix with a random letter
  if (/^[0-9]/.test(slug)) {
    const prefix = faker.string.alpha({ length: 1, casing: "lower" });
    slug = `${prefix}-${slug}`;
  }

  return slug;
}

/**
 * Generate a status based on distribution
 *
 * @param distribution - Status distribution weights
 * @returns Selected status
 */
function generateStatus(distribution: {
  done: number;
  inProgress: number;
  open: number;
}): WorkItemStatus {
  const rand = faker.number.float({ min: 0, max: 1 });

  if (rand < distribution.done) {
    return WORK_ITEM_STATUSES[2];
  }
  if (rand < distribution.done + distribution.inProgress) {
    return WORK_ITEM_STATUSES[1];
  }
  return WORK_ITEM_STATUSES[0];
}

/**
 * Generate a fixture tree from configuration
 *
 * This is a pure function with no I/O. The tree can be materialized
 * to the filesystem using materializeFixture().
 *
 * @param config - Fixture configuration
 * @returns Generated fixture tree
 */
export function generateFixtureTree(config: FixtureConfig): FixtureTree {
  // Seed faker for reproducibility
  faker.seed(config.seed ?? Date.now());

  const nodes: FixtureNode[] = [];
  const adrsPerCap = config.adrsPerCapability ?? 1;

  for (let capIdx = 0; capIdx < config.capabilities; capIdx++) {
    const capNumber = generateBSPNumber(capIdx, config.capabilities);
    const capSlug = generateSlug();

    const capChildren: FixtureNode[] = [];

    // Generate ADRs
    for (let adrIdx = 0; adrIdx < adrsPerCap; adrIdx++) {
      capChildren.push({
        kind: SPEC_TREE_ADR_KIND,
        number: adrIdx + 1, // ADRs use sequential numbering (001, 002, etc.)
        slug: generateSlug(),
        children: [],
      });
    }

    // Generate features
    for (
      let featIdx = 0;
      featIdx < config.featuresPerCapability;
      featIdx++
    ) {
      const featNumber = generateBSPNumber(
        featIdx,
        config.featuresPerCapability,
      );
      const featSlug = generateSlug();

      const featChildren: FixtureNode[] = [];

      // Generate stories
      for (
        let storyIdx = 0;
        storyIdx < config.storiesPerFeature;
        storyIdx++
      ) {
        const storyNumber = generateBSPNumber(
          storyIdx,
          config.storiesPerFeature,
        );
        const storySlug = generateSlug();
        const storyStatus = generateStatus(config.statusDistribution);

        featChildren.push({
          kind: WORK_ITEM_KINDS[2],
          number: storyNumber,
          slug: storySlug,
          status: storyStatus,
          children: [],
        });
      }

      // Determine feature status from children
      const featStatus = deriveStatus(featChildren);

      capChildren.push({
        kind: WORK_ITEM_KINDS[1],
        number: featNumber,
        slug: featSlug,
        status: featStatus,
        children: featChildren,
      });
    }

    // Determine capability status from children (excluding ADRs)
    const capStatus = deriveStatus(
      capChildren.filter((c) => c.kind !== SPEC_TREE_ADR_KIND),
    );

    nodes.push({
      kind: WORK_ITEM_KINDS[0],
      number: capNumber,
      slug: capSlug,
      status: capStatus,
      children: capChildren,
    });
  }

  return { nodes, config };
}

/**
 * Derive parent status from children statuses
 *
 * - All DONE -> DONE
 * - Any IN_PROGRESS or mixed -> IN_PROGRESS
 * - All OPEN -> OPEN
 */
function deriveStatus(children: FixtureNode[]): WorkItemStatus {
  const statuses = children
    .filter((c) => c.status !== undefined)
    .map((c) => c.status!);

  if (statuses.length === 0) {
    return WORK_ITEM_STATUSES[0];
  }

  if (statuses.every((s) => s === WORK_ITEM_STATUSES[2])) {
    return WORK_ITEM_STATUSES[2];
  }

  if (statuses.every((s) => s === WORK_ITEM_STATUSES[0])) {
    return WORK_ITEM_STATUSES[0];
  }

  return WORK_ITEM_STATUSES[1];
}

/**
 * Count total nodes in a tree
 *
 * @param tree - Fixture tree
 * @returns Total number of nodes (excluding ADRs)
 */
export function countNodes(tree: FixtureTree): number {
  let count = 0;

  function traverse(nodes: FixtureNode[]): void {
    for (const node of nodes) {
      if (node.kind !== SPEC_TREE_ADR_KIND) {
        count++;
      }
      traverse(node.children);
    }
  }

  traverse(tree.nodes);
  return count;
}

/**
 * Collect status counts from a tree
 *
 * @param tree - Fixture tree
 * @returns Status counts
 */
export function collectStatuses(tree: FixtureTree): {
  done: number;
  inProgress: number;
  open: number;
  total: number;
} {
  const counts = { done: 0, inProgress: 0, open: 0, total: 0 };

  function traverse(nodes: FixtureNode[]): void {
    for (const node of nodes) {
      if (node.status !== undefined) {
        counts.total++;
        if (node.status === WORK_ITEM_STATUSES[2]) counts.done++;
        else if (node.status === WORK_ITEM_STATUSES[1]) counts.inProgress++;
        else counts.open++;
      }
      traverse(node.children);
    }
  }

  traverse(tree.nodes);
  return counts;
}
