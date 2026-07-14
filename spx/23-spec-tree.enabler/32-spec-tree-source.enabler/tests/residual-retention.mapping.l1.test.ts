import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  createFilesystemSpecTreeSource,
  KIND_REGISTRY,
  readSpecTree,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
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
    const supersededSuffix = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.supersededNodeSuffix());
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

  it("classifies against a version set injected through the filesystem source", async () => {
    const scenario = sampleSpecTreeTestValue(NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario());
    const demotedDirectory = orderedDirectoryName(scenario.demotedRegistrySuffix);

    await withSpecTreeEnv({}, async (env) => {
      await writeOrderedDirectory(env, demotedDirectory);

      const source = createFilesystemSpecTreeSource({
        productDir: env.productDir,
        schemaVersions: scenario.schemaVersions,
      });
      const snapshot = await readSpecTree({ source });
      const superseded = expectPresent(snapshot.superseded.find((entry) => entry.id === demotedDirectory));

      // Under the default versions the registry-live suffix is canonical; the injected
      // set demotes it to a prior version, so the source must classify it superseded.
      expect(superseded.version).toBe(scenario.demotedVersion);
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(demotedDirectory);
    });
  });
});
