import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  readSpecTree,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  orderedDirectoryName,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

function priorVersionAccepting(suffix: string): string {
  const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);
  const prior = SPEC_TREE_NAMING_SCHEMA_VERSIONS.find(
    (version) => version !== canonical && version.nodeSuffixes.includes(suffix),
  );
  return expectPresent(prior).version;
}

describe("residual retention", () => {
  it("emits a name matching a prior version as a superseded entry carrying that version", async () => {
    const supersededSuffix = expectPresent(SPEC_TREE_GRAMMAR.DEPRECATED_NODE_SUFFIXES[0]);
    const supersededDirectory = orderedDirectoryName(supersededSuffix);

    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();
      await writeOrderedDirectory(env, supersededDirectory);

      const snapshot = await readSpecTree({ source: env.filesystemSource() });
      const superseded = expectPresent(snapshot.superseded.find((entry) => entry.id === supersededDirectory));

      expect(superseded.version).toBe(priorVersionAccepting(supersededSuffix));
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(supersededDirectory);
    });
  });

  it("retains a name matching no version as an invalid entry rather than dropping it", async () => {
    const invalidSuffix = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY));
    const invalidDirectory = orderedDirectoryName(invalidSuffix);

    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();
      await writeOrderedDirectory(env, invalidDirectory);

      const snapshot = await readSpecTree({ source: env.filesystemSource() });

      expect(snapshot.residual.map((entry) => entry.id)).toContain(invalidDirectory);
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(invalidDirectory);
    });
  });
});
