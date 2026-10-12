import { describe, expect, it } from "vitest";

import {
  canonicalNamingSchemaVersion,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
} from "@/lib/spec-tree";
import { FOUR_ZERO_INDEX_GENERATOR, THREE_X_INDEX_GENERATOR } from "@testing/generators/spec-tree/naming-schema-form";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the 4.0 naming-schema index form", () => {
  it("accepts every two-digit integer from 10 to 99 followed by zero or more two-digit fractional segments", () => {
    assertProperty(
      FOUR_ZERO_INDEX_GENERATOR.accepted(),
      (index) => {
        expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.order.PATTERN.test(index)).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts an index exactly when it has that form and rejects every other index", () => {
    assertProperty(
      FOUR_ZERO_INDEX_GENERATOR.candidate(),
      ({ index, accepted }) => {
        expect(SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION.order.PATTERN.test(index)).toBe(accepted);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("the 3.x naming-schema index form", () => {
  it("accepts every dot-separated run of digits", () => {
    assertProperty(
      THREE_X_INDEX_GENERATOR.accepted(),
      (index) => {
        expect(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).order.PATTERN.test(index)).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts an index exactly when it is a dot-separated run of digits and rejects every other index", () => {
    assertProperty(
      THREE_X_INDEX_GENERATOR.candidate(),
      ({ index, accepted }) => {
        expect(canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS).order.PATTERN.test(index)).toBe(accepted);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
