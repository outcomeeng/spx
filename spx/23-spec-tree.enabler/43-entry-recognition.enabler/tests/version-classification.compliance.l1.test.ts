import { describe, it } from "vitest";

import {
  assertCanonicalForeignSuffixMapsToInvalidEntry,
  assertInjectedCanonicalVersionGovernsValidity,
  assertInjectedEvidenceGrammarGovernsRecognition,
} from "@testing/harnesses/spec-tree/naming-schema-version";

describe("version classification grammar compliance", () => {
  it("gates validity on the injected canonical version", () => {
    assertInjectedCanonicalVersionGovernsValidity();
  });

  it("rejects a canonical suffix with no backing registry kind", () => {
    assertCanonicalForeignSuffixMapsToInvalidEntry();
  });

  it("recognizes evidence through the injected canonical grammar", () => {
    assertInjectedEvidenceGrammarGovernsRecognition();
  });
});
