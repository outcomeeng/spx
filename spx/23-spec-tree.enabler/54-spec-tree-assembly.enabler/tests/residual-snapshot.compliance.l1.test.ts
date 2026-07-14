import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, readSpecTree } from "@/lib/spec-tree";
import {
  orderedDirectoryName,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

describe("residual snapshot", () => {
  it("carries superseded entries and the invalid residual distinct from the assembled valid tree", async () => {
    const supersededDirectory = orderedDirectoryName(
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.supersededNodeSuffix()),
    );
    const invalidDirectory = orderedDirectoryName(
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY)),
    );

    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();
      await writeOrderedDirectory(env, supersededDirectory);
      await writeOrderedDirectory(env, invalidDirectory);

      const snapshot = await readSpecTree({ source: env.filesystemSource() });
      const validIds = new Set(snapshot.allNodes.map((node) => node.id));
      const supersededIds = new Set(snapshot.superseded.map((entry) => entry.id));
      const residualIds = new Set(snapshot.residual.map((entry) => entry.id));
      const materializedRootId = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);

      expect(validIds.has(materializedRootId)).toBe(true);
      expect(supersededIds.has(supersededDirectory)).toBe(true);
      expect(residualIds.has(invalidDirectory)).toBe(true);

      expect(validIds.has(supersededDirectory)).toBe(false);
      expect(validIds.has(invalidDirectory)).toBe(false);
      expect([...supersededIds].some((id) => residualIds.has(id))).toBe(false);
    });
  });
});
