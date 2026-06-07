import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { DECISION_SUFFIXES, KIND_REGISTRY, NODE_SUFFIXES } from "@/lib/spec-tree/config";

// The size of every grammar token group named by the spec, read through the registry surface.
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
  SPEC_TREE_GRAMMAR.EVAL_LANE.length,
  SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES.length,
];

describe("filename grammar token vocabulary", () => {
  it("resolves every grammar token group to a non-empty value on the registry surface", () => {
    for (const size of grammarTokenGroupSizes) {
      expect(size).toBeGreaterThan(0);
    }
  });

  it("exposes the evidence-file grammar as the one shared object, not a re-declared constant", () => {
    expect(SPEC_TREE_EVIDENCE_FILE).toBe(SPEC_TREE_GRAMMAR.EVIDENCE);
  });

  it("sources the canonical version's suffix sets from the kind registry, not redeclared literals", () => {
    const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);
    expect([...canonical.nodeSuffixes].sort()).toEqual([...NODE_SUFFIXES].sort());
    expect([...canonical.decisionSuffixes].sort()).toEqual([...DECISION_SUFFIXES].sort());
  });

  it("keeps prior-version node suffixes out of the live kind registry", () => {
    const liveSuffixes = Object.values(KIND_REGISTRY).map((definition) => definition.suffix);
    for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) {
      expect(liveSuffixes).not.toContain(suffix);
    }
  });

  it("declares the prior-version node suffixes only in the prior naming-schema versions", () => {
    const canonicalNodeSuffixes = new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).nodeSuffixes);
    for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) {
      expect(canonicalNodeSuffixes.has(suffix)).toBe(false);
    }
  });
});
