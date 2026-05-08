import { describe, expect, it } from "vitest";

import { detectReuse, REMEDIATION } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  literalAstOccurrenceCases,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { buildStringAssertion, buildStringDeclaration } from "@testing/harnesses/literal/snippets";

import { collectFromSource, emptyAllowlist, indexSources, testOccurrences } from "./support";

describe("finding-kind → remediation mapping", () => {
  it("src↔test reuse findings carry remediation === REMEDIATION.IMPORT_FROM_SOURCE", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(literal)]);
    const tests = testOccurrences([testFile, buildStringAssertion(literal)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: emptyAllowlist() });

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

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(otherLiteral)]);
    const tests = testOccurrences(
      [firstTestFile, buildStringAssertion(literal)],
      [secondTestFile, buildStringAssertion(literal)],
    );

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: emptyAllowlist() });

    const findings = result.testDupe.filter((f) => f.value === literal);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    for (const finding of findings) {
      expect(finding.remediation).toBe(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR);
    }
  });
});

describe("AST node → occurrence-kind mapping", () => {
  it.each(literalAstOccurrenceCases())(
    "$label produces an occurrence with the expected kind and value",
    ({ buildSource, buildValue, expectedKind }) => {
      const value = buildValue();
      const source = buildSource(value);
      const filename = sampleLiteralTestValue(arbitrarySourceFilePath());

      const occurrences = collectFromSource(source, filename);
      const match = occurrences.find((o) => o.value === value);

      expect(match).toBeDefined();
      expect(match?.kind).toBe(expectedKind);
    },
  );
});
