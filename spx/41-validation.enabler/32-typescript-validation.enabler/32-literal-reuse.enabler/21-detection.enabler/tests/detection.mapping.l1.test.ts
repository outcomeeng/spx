import { describe, expect, it } from "vitest";

import { detectReuse, LITERAL_KIND, REMEDIATION } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

import { collectFromSource, EMPTY_ALLOWLIST, indexSources, testOccurrences } from "./support";

const STRING_LITERAL_DECLARATION = "stringLiteralDeclaration";
const NUMERIC_LITERAL_DECLARATION = "numericLiteralDeclaration";
const TEMPLATE_ELEMENT_DECLARATION = "templateElementDeclaration";

describe("finding-kind → remediation mapping", () => {
  it("src↔test reuse findings carry remediation === REMEDIATION.IMPORT_FROM_SOURCE", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, `export const STATE = "${literal}";`]);
    const tests = testOccurrences([testFile, `expect(value).toBe("${literal}");`]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const finding = result.srcReuse.find((f) => f.value === literal);
    expect(finding).toBeDefined();
    expect(finding?.remediation).toBe(REMEDIATION.IMPORT_FROM_SOURCE);
  });

  it("test↔test duplication findings carry remediation === REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const otherLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const firstTestFile = sampleLiteralTestValue(arbitraryTestFilePath());
    const secondTestFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, `export const OTHER = "${otherLiteral}";`]);
    const tests = testOccurrences(
      [firstTestFile, `expect(value).toBe("${literal}");`],
      [secondTestFile, `expect(value).toBe("${literal}");`],
    );

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const findings = result.testDupe.filter((f) => f.value === literal);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    for (const finding of findings) {
      expect(finding.remediation).toBe(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR);
    }
  });
});

describe("AST node → occurrence-kind mapping", () => {
  it.each([
    {
      label: STRING_LITERAL_DECLARATION,
      buildSource: (value: string) => `export const S = "${value}";`,
      buildValue: () => sampleLiteralTestValue(arbitraryDomainLiteral()),
      expectedKind: LITERAL_KIND.STRING,
    },
    {
      label: NUMERIC_LITERAL_DECLARATION,
      buildSource: (value: string) => `export const N = ${value};`,
      buildValue: () => String(sampleLiteralTestValue(arbitraryDomainNumber())),
      expectedKind: LITERAL_KIND.NUMBER,
    },
    {
      label: TEMPLATE_ELEMENT_DECLARATION,
      buildSource: (value: string) => `export const T = \`${value}\`;`,
      buildValue: () => sampleLiteralTestValue(arbitraryDomainLiteral()),
      expectedKind: LITERAL_KIND.STRING,
    },
  ])("$label produces an occurrence with the expected kind and value", ({ buildSource, buildValue, expectedKind }) => {
    const value = buildValue();
    const source = buildSource(value);
    const filename = sampleLiteralTestValue(arbitrarySourceFilePath());

    const occurrences = collectFromSource(source, filename);
    const match = occurrences.find((o) => o.value === value);

    expect(match).toBeDefined();
    expect(match?.kind).toBe(expectedKind);
  });
});
