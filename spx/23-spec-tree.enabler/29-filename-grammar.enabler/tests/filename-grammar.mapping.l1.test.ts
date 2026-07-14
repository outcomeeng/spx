import { describe, it } from "vitest";

import {
  assertCanonicalSuffixesComeFromKindRegistry,
  assertEvidenceFileGrammarUsesSharedRegistryObject,
  assertFilenameGrammarTokenGroupsAreNonEmpty,
  assertPriorNodeSuffixesStayInsidePriorSchemas,
  assertPriorNodeSuffixesStayOutsideLiveRegistry,
} from "@testing/harnesses/spec-tree/filename-grammar";

describe("filename grammar token vocabulary", () => {
  it("resolves every grammar token group to a non-empty value on the registry surface", () => {
    assertFilenameGrammarTokenGroupsAreNonEmpty();
  });

  it("exposes the evidence-file grammar as the one shared object, not a re-declared constant", () => {
    assertEvidenceFileGrammarUsesSharedRegistryObject();
  });

  it("sources the canonical version's suffix sets from the kind registry, not redeclared literals", () => {
    assertCanonicalSuffixesComeFromKindRegistry();
  });

  it("keeps prior-version node suffixes out of the live kind registry", () => {
    assertPriorNodeSuffixesStayOutsideLiveRegistry();
  });

  it("declares the prior-version node suffixes only in the prior naming-schema versions", () => {
    assertPriorNodeSuffixesStayInsidePriorSchemas();
  });
});
