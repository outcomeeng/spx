import { describe, expect, it } from "vitest";

import { collectLiterals, DEFAULT_LITERAL_COLLECT_OPTIONS, LITERAL_KIND } from "@/validation/literal/index";
import { LITERAL_TEST_GENERATOR } from "@testing/generators/literal/literal";
import {
  buildNumericAssertion,
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
  buildTemplateDeclaration,
} from "@testing/generators/literal/snippets";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("TypeScript snippet generators", () => {
  it("are deterministic and round-trip every canonical form through literal detection", () => {
    assertProperty(
      LITERAL_TEST_GENERATOR.snippetBuilderScenario(),
      ({ stringValue, numericValue, sourceFile, testFile }) => {
        expect(buildStringDeclaration(stringValue)).toBe(buildStringDeclaration(stringValue));
        expect(buildNumericDeclaration(numericValue)).toBe(buildNumericDeclaration(numericValue));
        expect(buildTemplateDeclaration(stringValue)).toBe(buildTemplateDeclaration(stringValue));
        expect(buildStringAssertion(stringValue)).toBe(buildStringAssertion(stringValue));
        expect(buildNumericAssertion(numericValue)).toBe(buildNumericAssertion(numericValue));

        expect(collectLiterals(buildStringDeclaration(stringValue), sourceFile, DEFAULT_LITERAL_COLLECT_OPTIONS))
          .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value: stringValue }));
        expect(collectLiterals(buildNumericDeclaration(numericValue), sourceFile, DEFAULT_LITERAL_COLLECT_OPTIONS))
          .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.NUMBER, value: numericValue }));
        expect(collectLiterals(buildTemplateDeclaration(stringValue), sourceFile, DEFAULT_LITERAL_COLLECT_OPTIONS))
          .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value: stringValue }));
        expect(collectLiterals(buildStringAssertion(stringValue), testFile, DEFAULT_LITERAL_COLLECT_OPTIONS))
          .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value: stringValue }));
        expect(collectLiterals(buildNumericAssertion(numericValue), testFile, DEFAULT_LITERAL_COLLECT_OPTIONS))
          .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.NUMBER, value: numericValue }));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
