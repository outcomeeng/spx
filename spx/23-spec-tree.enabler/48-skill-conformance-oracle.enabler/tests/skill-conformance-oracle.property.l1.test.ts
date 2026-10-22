import { describe, expect, it } from "vitest";

import { classifySpecTreePath } from "@/lib/spec-tree";
import {
  arbitraryConformanceInput,
  SKILL_CONFORMANCE_FOREIGN_GENERATOR,
} from "@testing/generators/spec-tree/skill-conformance";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("skill-conformance oracle classification", () => {
  it("gives every path whose verdict the spec fixes by construction exactly that verdict", () => {
    assertProperty(
      arbitraryConformanceInput(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps every generated path that matches no recognized form to foreign", () => {
    assertProperty(
      SKILL_CONFORMANCE_FOREIGN_GENERATOR.strayPath(),
      ({ record, context, options, verdict }) => {
        expect({ path: record.relativePath, verdict: classifySpecTreePath(record, context, options) }).toEqual({
          path: record.relativePath,
          verdict,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
