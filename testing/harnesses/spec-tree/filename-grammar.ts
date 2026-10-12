import { expect, it } from "vitest";

import {
  KIND_REGISTRY,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
} from "@/lib/spec-tree";
import {
  arbitraryEvidenceRecognitionCase,
  productEntryRecognitionCase,
  type SpecTreeEntryRecognitionCase,
  specTreeEntryRecognitionCases,
} from "@testing/generators/spec-tree/filename-grammar";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const PARAMETERIZED_CASE_TITLE = "$title";

export function registerSpecTreeEntryRecognitionEvidence(): void {
  it.each(specTreeEntryRecognitionCases())(PARAMETERIZED_CASE_TITLE, assertSpecTreeEntryRecognitionCase);
  it("maps a generated product filename to a product entry", assertProductEntryRecognition);
}

export function registerEvidenceRecognitionProperty(): void {
  it("maps every generated canonical evidence filename under tests to evidence", assertEvidenceRecognitionProperty);
}

export function assertSpecTreeEntryRecognitionCase(testCase: SpecTreeEntryRecognitionCase): void {
  const entry = expectPresent(
    recognizeSpecTreeFilesystemEntry(
      {
        type: testCase.recordType,
        relativePath: testCase.relativePath,
        parentId: testCase.parentId,
      },
      KIND_REGISTRY[testCase.kind].category === SPEC_TREE_KIND_CATEGORY.OUTPUT
        ? {
          schemaVersions: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
          selectedVersions: [SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION],
        }
        : undefined,
    ),
  );
  const definition = KIND_REGISTRY[testCase.kind];
  const expectedType = definition.category === SPEC_TREE_KIND_CATEGORY.DECISION
    ? SPEC_TREE_ENTRY_TYPE.DECISION
    : SPEC_TREE_ENTRY_TYPE.NODE;
  expect(entry.type).toBe(expectedType);
  if (entry.type !== SPEC_TREE_ENTRY_TYPE.NODE && entry.type !== SPEC_TREE_ENTRY_TYPE.DECISION) {
    throw new Error("Expected a recognized node or decision entry");
  }
  expect(entry.kind).toBe(testCase.kind);
  expect(entry.order).toBe(testCase.order);
  expect(entry.slug).toBe(testCase.slug);
  expect(entry.parentId).toBe(testCase.parentId);
}

export function assertProductEntryRecognition(): void {
  const testCase = productEntryRecognitionCase();
  expect(
    recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: testCase.relativePath,
    }),
  ).toEqual({
    type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
    id: testCase.relativePath,
    title: testCase.slug,
    ref: {
      id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${testCase.relativePath}`,
      path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${testCase.relativePath}`,
    },
  });
}

export function assertEvidenceRecognitionProperty(): void {
  assertProperty(
    arbitraryEvidenceRecognitionCase(),
    (testCase) => {
      const entry = expectPresent(
        recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
          relativePath: testCase.relativePath,
          parentId: testCase.parentId,
        }),
      );
      expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
      if (entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE) expect(entry.parentId).toBe(testCase.parentId);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}
