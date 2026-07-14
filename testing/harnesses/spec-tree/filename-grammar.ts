import { expect } from "vitest";

import {
  canonicalNamingSchemaVersion,
  DECISION_SUFFIXES,
  KIND_REGISTRY,
  NODE_SUFFIXES,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import type { FilenameGrammarTokenCase } from "@testing/generators/spec-tree/filename-grammar";

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
