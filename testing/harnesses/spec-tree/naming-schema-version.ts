import * as fc from "fast-check";
import { expect } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const L1_PROPERTY = { level: PROPERTY_LEVEL.L1 } as const;

function directoryRecord(order: number, slug: string, suffix: string) {
  return {
    type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
    relativePath: `${order}-${slug}${suffix}`,
  };
}

export function assertCanonicalVersionNameMapsToValidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.validNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    },
    L1_PROPERTY,
  );
}

export function assertPriorVersionNameMapsToSupersededEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.supersededNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
      if (entry.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED) {
        expect(entry.version).toBe(scenario.supersededVersion);
      }
    },
    L1_PROPERTY,
  );
}

export function assertUnknownVersionNameMapsToInvalidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.recognitionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.invalidNodeSuffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
    },
    L1_PROPERTY,
  );
}

export function assertInjectedCanonicalVersionGovernsValidity(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.demotedRegistrySuffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
      if (entry.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED) {
        expect(entry.version).toBe(scenario.demotedVersion);
      }
    },
    L1_PROPERTY,
  );
}

export function assertCanonicalForeignSuffixMapsToInvalidEntry(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.canonicalForeignSuffixScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, order, slug]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(directoryRecord(order, slug, scenario.foreignCanonicalSuffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
    },
    L1_PROPERTY,
  );
}

export function assertInjectedEvidenceGrammarGovernsRecognition(): void {
  assertProperty(
    fc.tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.injectedEvidenceGrammarScenario(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    ),
    ([scenario, parentId]) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry(
          {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: scenario.relativePath,
            parentId,
          },
          { schemaVersions: scenario.schemaVersions, selectedVersions: scenario.selectedVersions },
        ),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
    },
    L1_PROPERTY,
  );
}
