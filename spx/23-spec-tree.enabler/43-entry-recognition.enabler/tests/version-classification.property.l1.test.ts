import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import {
  arbitrarySupersededLineScenario,
  arbitraryValidRecognitionScenario,
} from "@testing/generators/spec-tree/filename-grammar";
import {
  NAMING_SCHEMA_VERSION_TEST_GENERATOR,
  orderedDirectoryRecord,
} from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("version classification", () => {
  it("maps every name valid under the selected versions of each methodology line to a valid entry of its kind", () => {
    assertProperty(
      arbitraryValidRecognitionScenario(),
      ({ line, record, expected }) => {
        const entry = recognizeSpecTreeFilesystemEntry(record, recognitionOptionsForLine(line));

        expect(entry).toMatchObject(expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps a node directory or product root only a version ordered before each line's target accepts to a superseded entry naming the newest such version", () => {
    assertProperty(
      arbitrarySupersededLineScenario(),
      ({ line, record, expectedVersion }) => {
        const entry = recognizeSpecTreeFilesystemEntry(record, recognitionOptionsForLine(line));

        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
        expect(entry).toMatchObject({ version: expectedVersion });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the newest of several prior versions that accept one suffix, whatever the tuple order", () => {
    assertProperty(
      fc.tuple(
        NAMING_SCHEMA_VERSION_TEST_GENERATOR.supersededTupleScenario(),
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      ),
      ([scenario, order, slug]) => {
        const entry = recognizeSpecTreeFilesystemEntry(orderedDirectoryRecord(order, slug, scenario.suffix), {
          schemaVersions: scenario.schemaVersions,
          selectedVersions: scenario.selectedVersions,
        });

        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
        expect(entry).toMatchObject({ version: scenario.expectedVersion });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps an ordered directory neither valid under the selected versions nor matching an earlier version to an invalid entry", () => {
    assertProperty(
      SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectoryScenario(KIND_REGISTRY),
      ({ line, directory }) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: directory },
          recognitionOptionsForLine(line),
        );

        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
