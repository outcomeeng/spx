import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
} from "@/lib/spec-tree";
import { fourZeroFormExpectation, threeXFormExpectation } from "@testing/generators/spec-tree/naming-schema-form";

describe("the 4.0 naming-schema version", () => {
  it("accepts the product and output node kinds", () => {
    expect(new Set(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.nodeSuffixes)).toEqual(
      new Set(fourZeroFormExpectation().nodeSuffixes),
    );
  });

  it("holds each node's spec in a `{slug}.spec.md` file and the root spec in a `{name}.spec.md` file declaring the product kind", () => {
    const expected = fourZeroFormExpectation();

    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.specFileSuffix).toBe(expected.specFileSuffix);
    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.productSuffix).toBe(expected.rootSpecSuffix);
    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.rootSpecKind).toBe(expected.rootSpecKind);
  });

  it("accepts `ISSUES.md` as the only node-local note", () => {
    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.coordinationNotes).toEqual(
      fourZeroFormExpectation().coordinationNotes,
    );
  });
});

describe("the 3.x naming-schema version", () => {
  it("accepts the enabler and outcome node kinds", () => {
    expect(new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).nodeSuffixes)).toEqual(
      new Set(threeXFormExpectation().nodeSuffixes),
    );
  });

  it("holds each node's spec in a `{slug}.md` file and the root spec in a `{name}.product.md` file", () => {
    const expected = threeXFormExpectation();
    const version = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);

    expect(version.specFileSuffix).toBe(expected.specFileSuffix);
    expect(version.productSuffix).toBe(expected.rootSpecSuffix);
    expect(version.rootSpecKind).toBe(expected.rootSpecKind);
  });

  it("accepts `PLAN.md` and `ISSUES.md` as node-local notes", () => {
    expect(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).coordinationNotes).toEqual(
      threeXFormExpectation().coordinationNotes,
    );
  });

  it("accepts dot-separated digit-run indices and rejects every other form", () => {
    const expected = threeXFormExpectation();
    const version = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);

    for (const index of expected.acceptedIndexes) {
      expect(version.order.PATTERN.test(index)).toBe(true);
    }
    for (const index of expected.rejectedIndexes) {
      expect(version.order.PATTERN.test(index)).toBe(false);
    }
  });
});

describe("both naming-schema versions", () => {
  it("accept the decision forms of the ADR and PDR kinds", () => {
    expect(new Set(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.decisionSuffixes)).toEqual(
      new Set(fourZeroFormExpectation().decisionSuffixes),
    );
    expect(new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).decisionSuffixes)).toEqual(
      new Set(threeXFormExpectation().decisionSuffixes),
    );
  });

  it("accept the same test-file orderings", () => {
    const threeX = canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);

    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.evidence).toEqual(threeX.evidence);
    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.runners).toEqual(threeX.runners);
  });
});
