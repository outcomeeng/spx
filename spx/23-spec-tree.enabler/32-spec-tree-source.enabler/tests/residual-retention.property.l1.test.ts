import { describe, expect, it } from "vitest";

import { createFilesystemSpecTreeSource, KIND_REGISTRY, readSpecTree } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

describe("residual retention properties", () => {
  it("retains every generated invalid ordered directory", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectory(KIND_REGISTRY),
      async (invalidDirectory) => {
        await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          await env.materialize();
          await writeOrderedDirectory(env, invalidDirectory);
          const snapshot = await readSpecTree({ source: env.filesystemSource() });
          expect(snapshot.residual.map((entry) => entry.id)).toContain(invalidDirectory);
          expect(snapshot.allNodes.map((node) => node.id)).not.toContain(invalidDirectory);
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("classifies every generated demoted registry suffix through the injected version set", async () => {
    await assertProperty(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
      async (scenario) => {
        await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          const demotedDirectory =
            `${env.fixture.root.order}-${env.fixture.root.slug}${scenario.demotedRegistrySuffix}`;
          await writeOrderedDirectory(env, demotedDirectory);
          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({
              productDir: env.productDir,
              selection: { known: scenario.schemaVersions, selected: scenario.selectedVersions },
            }),
          });
          const superseded = snapshot.superseded.find((entry) => entry.id === demotedDirectory);
          expect(superseded?.version).toBe(scenario.demotedVersion);
          expect(snapshot.allNodes.map((node) => node.id)).not.toContain(demotedDirectory);
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
