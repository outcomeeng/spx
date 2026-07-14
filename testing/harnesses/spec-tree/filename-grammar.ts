import { resolveConfig } from "@/config";
import { expect, expectTypeOf, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type DecisionKind,
  type Kind,
  KIND_REGISTRY,
  type KindDefinition,
  NODE_KINDS,
  NODE_SUFFIXES,
  type NodeKind,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  specTreeConfigDescriptor,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  arbitraryEvidenceRecognitionCase,
  type FilenameGrammarTokenCase,
  type KindRegistryMappingCase,
  kindRegistryMappingCases,
  type KindRegistrySubsetCase,
  kindRegistrySubsetCases,
  type KindRegistrySuffixCase,
  kindRegistrySuffixCases,
  type KindRegistryTypeCase,
  kindRegistryTypeCases,
  productEntryRecognitionCase,
  SPEC_TREE_CONFIG_VALIDATION_EXPECTATION,
  type SpecTreeConfigValidationCase,
  specTreeConfigValidationCases,
  type SpecTreeEntryRecognitionCase,
  specTreeEntryRecognitionCases,
} from "@testing/generators/spec-tree/filename-grammar";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const NODE_SUFFIX_PATTERN = /^\.[a-z-]+$/;
const DECISION_SUFFIX_PATTERN = /^\.[a-z-]+\.md$/;
const SPEC_TREE_CONFIG_TEMP_PREFIX = "spx-spec-tree-config-";
const PARAMETERIZED_CASE_TITLE = "$title";

export function registerKindRegistryMappingEvidence(): void {
  it.each(kindRegistryMappingCases())(PARAMETERIZED_CASE_TITLE, assertKindRegistryMappingCase);
  it("projects directly from the semantic config object", assertKindRegistryComesFromSemanticConfig);
}

export function registerKindRegistrySubsetEvidence(): void {
  it.each(kindRegistrySubsetCases())(PARAMETERIZED_CASE_TITLE, assertKindRegistrySubsetCase);
}

export function registerKindRegistryTypeEvidence(): void {
  it.each(kindRegistryTypeCases())(PARAMETERIZED_CASE_TITLE, assertKindRegistryTypeCase);
  it("derives the public kind types from the runtime registry", assertKindRegistryTypesProjectFromRuntime);
}

export function registerKindRegistrySuffixEvidence(): void {
  it.each(kindRegistrySuffixCases())(PARAMETERIZED_CASE_TITLE, assertKindRegistrySuffixCase);
}

export function registerSpecTreeConfigEvidence(): void {
  it(
    "resolves the full default kind registry when no config file exists",
    assertDefaultSpecTreeConfigResolvesWithoutFile,
  );
  it.each(specTreeConfigValidationCases())(PARAMETERIZED_CASE_TITLE, assertSpecTreeConfigValidationCase);
}

export function registerSpecTreeEntryRecognitionEvidence(): void {
  it.each(specTreeEntryRecognitionCases())(PARAMETERIZED_CASE_TITLE, assertSpecTreeEntryRecognitionCase);
  it("maps a generated product filename to a product entry", assertProductEntryRecognition);
}

export function registerEvidenceRecognitionProperty(): void {
  it("maps every generated canonical evidence filename under tests to evidence", assertEvidenceRecognitionProperty);
}

export function assertFilenameGrammarTokenGroupIsNonEmpty(testCase: FilenameGrammarTokenCase): void {
  expect(testCase.size).toBeGreaterThan(0);
}

export function assertEvidenceFileGrammarUsesSharedRegistryObject(): void {
  expect(SPEC_TREE_EVIDENCE_FILE).toBe(SPEC_TREE_GRAMMAR.EVIDENCE);
}

export function assertCanonicalSuffixesComeFromKindRegistry(): void {
  const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);
  expect([...canonical.nodeSuffixes].sort(compareAsciiStrings)).toEqual([...NODE_SUFFIXES].sort(compareAsciiStrings));
  expect([...canonical.decisionSuffixes].sort(compareAsciiStrings)).toEqual(
    [...DECISION_SUFFIXES].sort(compareAsciiStrings),
  );
}

export function assertPriorNodeSuffixesStayOutsideLiveRegistry(): void {
  const liveSuffixes = Object.values(KIND_REGISTRY).map((definition) => definition.suffix);
  for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) expect(liveSuffixes).not.toContain(suffix);
}

export function assertPriorNodeSuffixesStayInsidePriorSchemas(): void {
  const canonicalNodeSuffixes = new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).nodeSuffixes);
  for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) expect(canonicalNodeSuffixes.has(suffix)).toBe(false);
}

export function assertKindRegistryMappingCase(testCase: KindRegistryMappingCase): void {
  const definition = KIND_REGISTRY[testCase.kind];
  expect(Object.values(SPEC_TREE_KIND_CATEGORY)).toContain(definition.category);
  expect(definition.label.length).toBeGreaterThan(0);
  expect(Array.isArray(definition.aliases)).toBe(true);
  expect(definition.suffix).toMatch(
    definition.category === SPEC_TREE_KIND_CATEGORY.NODE ? NODE_SUFFIX_PATTERN : DECISION_SUFFIX_PATTERN,
  );
}

export function assertKindRegistryComesFromSemanticConfig(): void {
  expect(KIND_REGISTRY).toBe(SPEC_TREE_CONFIG.KINDS);
}

export function assertKindRegistrySubsetCase(testCase: KindRegistrySubsetCase): void {
  const actualKinds = testCase.category === SPEC_TREE_KIND_CATEGORY.NODE ? NODE_KINDS : DECISION_KINDS;
  const actualSuffixes = testCase.category === SPEC_TREE_KIND_CATEGORY.NODE ? NODE_SUFFIXES : DECISION_SUFFIXES;
  expect([...actualKinds].sort(compareAsciiStrings)).toEqual([...testCase.projectedKinds].sort(compareAsciiStrings));
  expect([...actualSuffixes].sort(compareAsciiStrings)).toEqual(
    [...testCase.projectedSuffixes].sort(compareAsciiStrings),
  );
}

export function assertKindRegistryTypeCase(testCase: KindRegistryTypeCase): void {
  expect(KIND_REGISTRY[testCase.kind].category).toBe(testCase.category);
  expect(testCase.category === SPEC_TREE_KIND_CATEGORY.NODE ? NODE_KINDS : DECISION_KINDS).toContain(testCase.kind);
}

export function assertKindRegistryTypesProjectFromRuntime(): void {
  expectTypeOf<Kind>().toEqualTypeOf<keyof typeof KIND_REGISTRY>();
  expectTypeOf<NodeKind>().toExtend<Kind>();
  expectTypeOf<DecisionKind>().toExtend<Kind>();
  expectTypeOf<NodeKind | DecisionKind>().toEqualTypeOf<Kind>();
  expectTypeOf<KindDefinition<NodeKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[NodeKind]>();
  expectTypeOf<KindDefinition<DecisionKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[DecisionKind]>();
}

export function assertKindRegistrySuffixCase(testCase: KindRegistrySuffixCase): void {
  const suffixes = testCase.kinds.map((kind) => KIND_REGISTRY[kind].suffix);
  expect(new Set(suffixes).size).toBe(suffixes.length);
}

export async function assertDefaultSpecTreeConfigResolvesWithoutFile(): Promise<void> {
  await withTempDir(SPEC_TREE_CONFIG_TEMP_PREFIX, async (productDir) => {
    const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[SPEC_TREE_CONFIG.SECTION]).toEqual(specTreeConfigDescriptor.defaults);
    }
  });
}

export function assertSpecTreeConfigValidationCase(testCase: SpecTreeConfigValidationCase): void {
  const result = specTreeConfigDescriptor.validate(testCase.input);
  if (testCase.expectation === SPEC_TREE_CONFIG_VALIDATION_EXPECTATION.ACCEPTED_SUBSET) {
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.kinds).sort(compareAsciiStrings)).toEqual(
        [...testCase.selectedKinds].sort(compareAsciiStrings),
      );
    }
    return;
  }
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(testCase.offendingKind);
}

export function assertSpecTreeEntryRecognitionCase(testCase: SpecTreeEntryRecognitionCase): void {
  const entry = expectPresent(
    recognizeSpecTreeFilesystemEntry({
      type: testCase.recordType,
      relativePath: testCase.relativePath,
      parentId: testCase.parentId,
    }),
  );
  const definition = KIND_REGISTRY[testCase.kind];
  const expectedType = definition.category === SPEC_TREE_KIND_CATEGORY.NODE
    ? SPEC_TREE_ENTRY_TYPE.NODE
    : SPEC_TREE_ENTRY_TYPE.DECISION;
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
