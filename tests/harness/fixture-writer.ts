/**
 * Fixture writer for E2E testing
 *
 * - materializeFixture(tree) - Write tree to os.tmpdir()
 * - createFixture(config) - Convenience wrapper
 */
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/types";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DECISION_FIXTURE_KIND,
  type FixtureConfig,
  type FixtureNode,
  type FixtureTree,
  generateFixtureTree,
} from "./fixture-generator";

/**
 * Materialized fixture on disk
 */
export interface MaterializedFixture {
  /** Absolute path to fixture root */
  path: string;
  /** Cleanup function to remove all files */
  cleanup: () => Promise<void>;
  /** Original config for reference */
  config: FixtureConfig;
}

/**
 * Materialize a fixture tree to the filesystem
 *
 * Creates the directory structure in os.tmpdir() following
 * specs/templates/structure.yaml conventions.
 *
 * @param tree - Fixture tree from generateFixtureTree()
 * @returns Materialized fixture with path and cleanup function
 */
export async function materializeFixture(tree: FixtureTree): Promise<MaterializedFixture> {
  // Create unique fixture directory in tmpdir
  const fixtureId = randomUUID();
  const fixturePath = join(tmpdir(), `spx-fixture-${fixtureId}`);

  // Create base structure: {tmpdir}/spx-fixture-{uuid}/specs/work/doing/
  const doingPath = join(fixturePath, "specs", "work", "doing");
  await mkdir(doingPath, { recursive: true });

  // Materialize each capability
  for (const cap of tree.nodes) {
    await materializeCapability(doingPath, cap);
  }

  // Create cleanup function
  const cleanup = async (): Promise<void> => {
    try {
      await rm(fixturePath, { recursive: true, force: true });
    } catch {
      // Ignore errors if already deleted
    }
  };

  return {
    path: fixturePath,
    cleanup,
    config: tree.config,
  };
}

/**
 * Materialize a capability node
 */
async function materializeCapability(doingPath: string, cap: FixtureNode): Promise<void> {
  // Create capability directory: capability-{NN}_{slug}/
  const capDirName = `capability-${cap.number}_${cap.slug}`;
  const capPath = join(doingPath, capDirName);
  await mkdir(capPath, { recursive: true });

  // Create capability.md file
  const capMdPath = join(capPath, `${cap.slug}.capability.md`);
  await writeFile(
    capMdPath,
    `# Capability: ${formatSlugAsTitle(cap.slug)}\n\nGenerated fixture for testing.\n`,
  );

  // Create decisions directory and ADRs
  const decisionsPath = join(capPath, "decisions");
  await mkdir(decisionsPath, { recursive: true });

  const features = cap.children.filter((c) => c.kind === WORK_ITEM_KINDS[1]);
  for (const child of cap.children) {
    if (child.kind === DECISION_FIXTURE_KIND) {
      await materializeAdr(decisionsPath, child);
    } else if (child.kind === WORK_ITEM_KINDS[1]) {
      await materializeFeature(capPath, child);
    }
  }

  // If all features are DONE (all their stories are DONE), create tests/DONE.md for capability
  const allFeaturesDone = features.length > 0
    && features.every((f) => {
      const stories = f.children.filter((c) => c.kind === WORK_ITEM_KINDS[2]);
      return stories.length > 0 && stories.every((s) => s.status === WORK_ITEM_STATUSES[2]);
    });
  if (allFeaturesDone) {
    const testsPath = join(capPath, "tests");
    await mkdir(testsPath, { recursive: true });
    await writeFile(join(testsPath, "DONE.md"), `# Done\n\nAll features completed.\n`);
  }
}

/**
 * Materialize an ADR node
 */
async function materializeAdr(decisionsPath: string, adr: FixtureNode): Promise<void> {
  // Format ADR number as 3 digits: 001, 002, etc.
  const adrNum = String(adr.number).padStart(3, "0");
  const adrFileName = `adr-${adrNum}_${adr.slug}.md`;
  const adrPath = join(decisionsPath, adrFileName);

  await writeFile(
    adrPath,
    `# Decision: ${formatSlugAsTitle(adr.slug)}\n\n## Decision\n\nGenerated decision record for testing.\n`,
  );
}

/**
 * Materialize a feature node
 */
async function materializeFeature(capPath: string, feat: FixtureNode): Promise<void> {
  // Create feature directory: feature-{NN}_{slug}/
  const featDirName = `feature-${feat.number}_${feat.slug}`;
  const featPath = join(capPath, featDirName);
  await mkdir(featPath, { recursive: true });

  // Create feature.md file
  const featMdPath = join(featPath, `${feat.slug}.feature.md`);
  await writeFile(
    featMdPath,
    `# Feature: ${formatSlugAsTitle(feat.slug)}\n\nGenerated fixture for testing.\n`,
  );

  // Materialize stories
  const stories = feat.children.filter((c) => c.kind === WORK_ITEM_KINDS[2]);
  for (const story of stories) {
    await materializeStory(featPath, story);
  }

  // If all stories are DONE, create tests/DONE.md for feature (required for status rollup)
  const allStoriesDone = stories.length > 0 && stories.every((s) => s.status === WORK_ITEM_STATUSES[2]);
  if (allStoriesDone) {
    const testsPath = join(featPath, "tests");
    await mkdir(testsPath, { recursive: true });
    await writeFile(join(testsPath, "DONE.md"), `# Done\n\nAll stories completed.\n`);
  }
}

/**
 * Materialize a story node
 */
async function materializeStory(featPath: string, story: FixtureNode): Promise<void> {
  // Create story directory: story-{NN}_{slug}/
  const storyDirName = `story-${story.number}_${story.slug}`;
  const storyPath = join(featPath, storyDirName);
  await mkdir(storyPath, { recursive: true });

  // Create story.md file
  const storyMdPath = join(storyPath, `${story.slug}.story.md`);
  await writeFile(
    storyMdPath,
    `# Story: ${formatSlugAsTitle(story.slug)}\n\nGenerated fixture for testing.\n`,
  );

  // Create tests directory with status-appropriate contents
  const testsPath = join(storyPath, "tests");
  await mkdir(testsPath, { recursive: true });

  switch (story.status) {
    case WORK_ITEM_STATUSES[2]:
      // DONE: tests/DONE.md exists
      await writeFile(join(testsPath, "DONE.md"), `# Done\n\nStory completed.\n`);
      break;

    case WORK_ITEM_STATUSES[1]:
      // IN_PROGRESS: tests/*.test.ts exists, no DONE.md
      await writeFile(
        join(testsPath, "test.test.ts"),
        `// Generated test file for ${story.slug}\nimport { describe, it, expect } from "vitest";\n\ndescribe("${story.slug}", () => {\n  it("should pass", () => {\n    expect(true).toBe(true);\n  });\n});\n`,
      );
      break;

    case WORK_ITEM_STATUSES[0]:
      // OPEN: tests/ directory exists but is empty
      // Directory already created above, nothing more needed
      break;
  }
}

/**
 * Format a slug as a title
 *
 * @param slug - URL-safe slug (e.g., "my-feature")
 * @returns Title case string (e.g., "My Feature")
 */
function formatSlugAsTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Convenience wrapper: generate and materialize in one call
 *
 * @param config - Fixture configuration
 * @returns Materialized fixture with path and cleanup function
 */
export async function createFixture(config: FixtureConfig): Promise<MaterializedFixture> {
  const tree = generateFixtureTree(config);
  return materializeFixture(tree);
}
