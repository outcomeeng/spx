import { describe, it } from "vitest";

import {
  assertCanonicalNamingSchemaVersionBelongsToTuple,
  assertCanonicalNamingSchemaVersionIsSemanticMaximum,
  assertCanonicalSuffixesAreNeverSuperseded,
  assertNamingSchemaSpecFileSuffixMatchesVersionRole,
  assertNamingSchemaVersionsCarryAllFilenameForms,
  assertNamingSchemaVersionsFollowSemanticOrder,
  assertNonNumericNamingSchemaVersionIsRejected,
  assertSupersededSuffixesComeFromPriorVersions,
} from "@testing/harnesses/spec-tree/naming-schema-version";

describe("naming-schema version ordering", () => {
  it("orders versions exactly as the semantic-version oracle does", () => {
    assertNamingSchemaVersionsFollowSemanticOrder();
  });

  it("selects the canonical version as the semantic-version maximum of the tuple", () => {
    assertCanonicalNamingSchemaVersionIsSemanticMaximum();
  });

  it("selects the canonical version as a member of the tuple", () => {
    assertCanonicalNamingSchemaVersionBelongsToTuple();
  });

  it("rejects a non-numeric version identifier rather than mis-ordering it", () => {
    assertNonNumericNamingSchemaVersionIsRejected();
  });
});

describe("naming-schema superseded derivation", () => {
  it("derives the superseded node suffixes as the prior versions' suffixes less the canonical set", () => {
    assertSupersededSuffixesComeFromPriorVersions();
  });

  it("never reports a canonical suffix as superseded", () => {
    assertCanonicalSuffixesAreNeverSuperseded();
  });
});

describe("naming-schema version self-containment", () => {
  it("carries its own accepted filename forms on each version", () => {
    assertNamingSchemaVersionsCarryAllFilenameForms();
  });
});

describe("naming-schema spec-file form by role", () => {
  it("assigns the canonical suffix to exactly the canonical member and the bare suffix to every prior member", () => {
    assertNamingSchemaSpecFileSuffixMatchesVersionRole();
  });
});
