import { describe, expect, it } from "vitest";

import { detectReuse, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  buildNumericAssertion,
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
} from "@testing/harnesses/literal/snippets";

import { EMPTY_ALLOWLIST, indexSources, testOccurrences } from "./support";

describe("literal-reuse detection — scenarios", () => {
  it("string literal carrying domain meaning in a src file and a test file produces a src↔test reuse finding citing both locations", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(literal)]);
    const tests = testOccurrences([testFile, buildStringAssertion(literal)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const finding = result.srcReuse.find((f) => f.value === literal);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.STRING);
    expect(finding?.test.file).toBe(testFile);
    expect(finding?.src.map((s) => s.file)).toContain(sourceFile);
    expect(result.testDupe).toHaveLength(0);
  });

  it("string literal in two or more test files with no source occurrence produces a test↔test duplication finding citing every test location", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const otherSourceLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const firstTestFile = sampleLiteralTestValue(arbitraryTestFilePath());
    const secondTestFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(otherSourceLiteral)]);
    const tests = testOccurrences(
      [firstTestFile, buildStringAssertion(literal)],
      [secondTestFile, buildStringAssertion(literal)],
    );

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const findings = result.testDupe.filter((f) => f.value === literal);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const cited = new Set<string>();
    for (const finding of findings) {
      cited.add(finding.test.file);
      for (const other of finding.otherTests) cited.add(other.file);
    }
    expect(cited.has(firstTestFile)).toBe(true);
    expect(cited.has(secondTestFile)).toBe(true);
  });

  it("numeric literal of meaningful magnitude duplicating between source and test produces a src↔test reuse finding", () => {
    const numericLiteral = sampleLiteralTestValue(arbitraryDomainNumber());
    const literalText = String(numericLiteral);
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildNumericDeclaration(literalText)]);
    const tests = testOccurrences([testFile, buildNumericAssertion(literalText)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const finding = result.srcReuse.find((f) => f.value === literalText);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.NUMBER);
  });

  it("literal value appearing exactly once in the codebase produces no problem for that value", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const otherLiteral = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(literal)]);
    const tests = testOccurrences([testFile, buildStringAssertion(otherLiteral)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: EMPTY_ALLOWLIST });

    const reuseHits = result.srcReuse.filter((f) => f.value === literal);
    const dupeHits = result.testDupe.filter((f) => f.value === literal);
    expect(reuseHits).toHaveLength(0);
    expect(dupeHits).toHaveLength(0);
  });
});
