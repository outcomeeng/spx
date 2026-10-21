import { describe, expect, it } from "vitest";

import { classifySpecTreePath, SPEC_TREE_CONFORMANCE_VERDICT } from "@/lib/spec-tree";
import {
  arbitraryConformanceInput,
  SKILL_CONFORMANCE_FOREIGN_GENERATOR,
} from "@testing/generators/spec-tree/skill-conformance";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("skill-conformance oracle classification", () => {
  it("gives every path exactly one verdict, valid or foreign", () => {
    assertProperty(
      arbitraryConformanceInput(),
      ({ record, context, options }) => {
        const verdicts = Object.values(SPEC_TREE_CONFORMANCE_VERDICT);
        const verdict = classifySpecTreePath(record, context, options);
        expect({ path: record.relativePath, matches: verdicts.filter((candidate) => candidate === verdict).length })
          .toEqual({ path: record.relativePath, matches: 1 });
        expect(classifySpecTreePath(record, context, options)).toBe(verdict);
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
