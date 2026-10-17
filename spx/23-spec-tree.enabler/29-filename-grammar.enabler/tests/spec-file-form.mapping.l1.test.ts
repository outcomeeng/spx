import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
} from "@/lib/spec-tree";
import { specFileFormCases } from "@testing/generators/spec-tree/filename-grammar";
import { fourZeroFormExpectation, threeXFormExpectation } from "@testing/generators/spec-tree/naming-schema-form";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("the naming-schema versions' accepted filesystem forms", () => {
  it.each(specFileFormCases())("recognizes: $title", (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(testCase.record, recognitionOptionsForLine(testCase.line));

    expect(entry).toMatchObject(testCase.expected);
  });
});

describe("the 4.0 naming-schema version", () => {
  it("accepts exactly the product and output node kinds", () => {
    expect(new Set(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.nodeSuffixes)).toEqual(
      new Set(fourZeroFormExpectation().nodeSuffixes),
    );
  });

  it("accepts `ISSUES.md` as the only node-local note", () => {
    expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.coordinationNotes).toEqual(
      fourZeroFormExpectation().coordinationNotes,
    );
  });
});

describe("the 3.x naming-schema version", () => {
  it("accepts exactly the enabler and outcome node kinds", () => {
    expect(new Set(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).nodeSuffixes)).toEqual(
      new Set(threeXFormExpectation().nodeSuffixes),
    );
  });

  it("accepts `PLAN.md` and `ISSUES.md` as node-local notes", () => {
    expect(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).coordinationNotes).toEqual(
      threeXFormExpectation().coordinationNotes,
    );
  });
});

describe("both naming-schema versions", () => {
  it("accept exactly the decision forms of the ADR and PDR kinds", () => {
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
