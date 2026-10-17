import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  DECISION_SUFFIXES,
  KIND_REGISTRY,
  NODE_SUFFIXES,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { firstVersionNodeDirectoryCases } from "@testing/generators/spec-tree/filename-grammar";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("node directories of the first naming-schema version", () => {
  it.each(firstVersionNodeDirectoryCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(testCase.record, testCase.options);

    expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
  });
});

describe("filename grammar token ownership", () => {
  it("exposes the evidence-file grammar as the one shared object, not a re-declared constant", () => {
    expect(SPEC_TREE_EVIDENCE_FILE).toBe(SPEC_TREE_GRAMMAR.EVIDENCE);
  });

  it("sources the canonical version's suffix sets from the kind registry, not redeclared literals", () => {
    const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);

    expect([...canonical.nodeSuffixes].sort(compareAsciiStrings)).toEqual([...NODE_SUFFIXES].sort(compareAsciiStrings));
    expect([...canonical.decisionSuffixes].sort(compareAsciiStrings)).toEqual(
      [...DECISION_SUFFIXES].sort(compareAsciiStrings),
    );
  });

  it("keeps prior-version node suffixes out of the live kind registry", () => {
    const liveSuffixes = Object.values(KIND_REGISTRY).map((definition) => definition.suffix);

    for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) expect(liveSuffixes).not.toContain(suffix);
  });

  it("declares the prior-version node suffixes only in the prior naming-schema versions", () => {
    const canonicalNodeSuffixes = new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).nodeSuffixes);

    for (const suffix of SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES) expect(canonicalNodeSuffixes.has(suffix)).toBe(false);
  });
});
