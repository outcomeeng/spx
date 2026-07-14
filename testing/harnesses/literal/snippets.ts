import * as fc from "fast-check";

import { collectLiterals, DEFAULT_LITERAL_COLLECT_OPTIONS, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
} from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

const SOURCE_BINDING_NAME = "V";
const TEST_VARIABLE_NAME = "v";

export function buildStringDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + JSON.stringify(value) + ";\n";
}

export function buildNumericDeclaration(numStr: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = " + numStr + ";\n";
}

export function buildTemplateDeclaration(value: string): string {
  return "export const " + SOURCE_BINDING_NAME + " = `" + value + "`;\n";
}

export function buildStringAssertion(value: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + JSON.stringify(value) + ");\n";
}

export function buildNumericAssertion(numStr: string): string {
  return "expect(" + TEST_VARIABLE_NAME + ").toBe(" + numStr + ");\n";
}

export const snippetBuilderPropertyCases = collectHarnessTestCases(() => {
  describe("snippet builders — detector round-trip", () => {
    it("indexes string declarations with their original value", () => {
      assertProperty(
        fc.tuple(arbitraryDomainLiteral(), arbitrarySourceFilePath()),
        ([value, filename]) => {
          expect(collectLiterals(buildStringDeclaration(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS))
            .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("indexes numeric declarations with their original value", () => {
      assertProperty(
        fc.tuple(arbitraryDomainNumber(), arbitrarySourceFilePath()),
        ([number, filename]) => {
          const value = String(number);
          expect(collectLiterals(buildNumericDeclaration(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS))
            .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.NUMBER, value }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("indexes template declarations with their original value", () => {
      assertProperty(
        fc.tuple(arbitraryDomainLiteral(), arbitrarySourceFilePath()),
        ([value, filename]) => {
          expect(collectLiterals(buildTemplateDeclaration(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS))
            .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("indexes string assertions with their original value", () => {
      assertProperty(
        fc.tuple(arbitraryDomainLiteral(), arbitraryTestFilePath()),
        ([value, filename]) => {
          expect(collectLiterals(buildStringAssertion(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS))
            .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("indexes numeric assertions with their original value", () => {
      assertProperty(
        fc.tuple(arbitraryDomainNumber(), arbitraryTestFilePath()),
        ([number, filename]) => {
          const value = String(number);
          expect(collectLiterals(buildNumericAssertion(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS))
            .toContainEqual(expect.objectContaining({ kind: LITERAL_KIND.NUMBER, value }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });

  describe("snippet builders — purity", () => {
    it("buildStringDeclaration is deterministic", () => {
      assertBuilderIsDeterministic(arbitraryDomainLiteral(), buildStringDeclaration);
    });
    it("buildNumericDeclaration is deterministic", () => {
      assertNumericBuilderIsDeterministic(buildNumericDeclaration);
    });
    it("buildTemplateDeclaration is deterministic", () => {
      assertBuilderIsDeterministic(arbitraryDomainLiteral(), buildTemplateDeclaration);
    });
    it("buildStringAssertion is deterministic", () => {
      assertBuilderIsDeterministic(arbitraryDomainLiteral(), buildStringAssertion);
    });
    it("buildNumericAssertion is deterministic", () => {
      assertNumericBuilderIsDeterministic(buildNumericAssertion);
    });
  });
});

function assertBuilderIsDeterministic(arbitrary: fc.Arbitrary<string>, builder: (value: string) => string): void {
  assertProperty(
    arbitrary,
    (value) => {
      expect(builder(value)).toBe(builder(value));
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

function assertNumericBuilderIsDeterministic(builder: (value: string) => string): void {
  assertProperty(
    arbitraryDomainNumber(),
    (number) => {
      const value = String(number);
      expect(builder(value)).toBe(builder(value));
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}
