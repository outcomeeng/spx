import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import {
  NAMING_SCHEMA_VERSION_TEST_GENERATOR,
  orderedDirectoryRecord,
} from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("version classification grammar compliance", () => {
  it("gates validity on the injected canonical version", () => {
    assertProperty(
      fc.tuple(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ),
      ([scenario, order, slug]) => {
        const options = { schemaVersions: scenario.schemaVersions, selectedVersions: scenario.selectedVersions };
        const demoted = recognizeSpecTreeFilesystemEntry(
          orderedDirectoryRecord(order, slug, scenario.demotedRegistrySuffix),
          options,
        );
        const canonical = recognizeSpecTreeFilesystemEntry(
          orderedDirectoryRecord(order, slug, scenario.canonicalRegistrySuffix),
          options,
        );

        expect(demoted?.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
        expect(demoted).toMatchObject({ version: scenario.demotedVersion });
        expect(canonical?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a canonical suffix with no backing registry kind", () => {
    assertProperty(
      fc.tuple(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.canonicalForeignSuffixScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ),
      ([scenario, order, slug]) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          orderedDirectoryRecord(order, slug, scenario.foreignCanonicalSuffix),
          { schemaVersions: scenario.schemaVersions, selectedVersions: scenario.selectedVersions },
        );

        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("recognizes evidence through the injected canonical grammar", () => {
    assertProperty(
      fc.tuple(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.injectedEvidenceGrammarScenario(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ),
      ([scenario, parentId]) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath: scenario.relativePath, parentId },
          { schemaVersions: scenario.schemaVersions, selectedVersions: scenario.selectedVersions },
        );

        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
