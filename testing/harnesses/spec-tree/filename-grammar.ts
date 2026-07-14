import { expect } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { DECISION_SUFFIXES, KIND_REGISTRY, NODE_SUFFIXES } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";

export function assertFilenameGrammarTokenGroupsAreNonEmpty(): void {
  const grammarTokenGroupSizes: readonly number[] = [
    SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX.length,
    SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME.length,
    SPEC_TREE_GRAMMAR.EVIDENCE.MODES.length,
    SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS.length,
    Object.keys(SPEC_TREE_GRAMMAR.EVIDENCE.TAILS).length,
    SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR.length,
    SPEC_TREE_GRAMMAR.RUNNERS.length,
    SPEC_TREE_GRAMMAR.ORDER.SEPARATOR.length,
    SPEC_TREE_GRAMMAR.ORDER.PATTERN.source.length,
    SPEC_TREE_GRAMMAR.PATH_SEPARATOR.length,
    SPEC_TREE_GRAMMAR.COORDINATION_NOTES.length,
    SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME.length,
    SPEC_TREE_GRAMMAR.EVAL.FILES.length,
    SPEC_TREE_GRAMMAR.EVAL.RUNS_DIRECTORY_NAME.length,
    SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX.length,
    SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX.length,
    SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length,
  ];
  for (const size of grammarTokenGroupSizes) expect(size).toBeGreaterThan(0);
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
