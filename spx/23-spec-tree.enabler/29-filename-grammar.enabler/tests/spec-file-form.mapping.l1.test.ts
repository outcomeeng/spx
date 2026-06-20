import { describe, expect, it } from "vitest";

import { canonicalNamingSchemaVersion, SPEC_TREE_GRAMMAR, SPEC_TREE_NAMING_SCHEMA_VERSIONS } from "@/lib/spec-tree";

describe("naming-schema spec-file form", () => {
  it("maps the canonical version's spec-file form to the spec document-kind suffix", () => {
    const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);

    expect(canonical.specFileSuffix).toBe(SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX);
  });

  it("maps every prior version's spec-file form to the bare slug suffix", () => {
    const canonical = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);
    const priorVersions = SPEC_TREE_NAMING_SCHEMA_VERSIONS.filter((version) => version !== canonical);

    expect(priorVersions.length).toBeGreaterThan(0);
    for (const version of priorVersions) {
      expect(version.specFileSuffix).toBe(SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX);
    }
  });

  it("distinguishes the canonical spec-file suffix from the prior bare suffix", () => {
    expect(SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX).not.toBe(SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX);
  });
});
