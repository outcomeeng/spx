import { describe, expect, it } from "vitest";

import { createEmptyLiteralAllowlist, detectReuse, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitraryLiteralReuseFixtureInputs,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  LITERAL_TEST_GENERATOR_COUNTS,
  sampleLiteralPair,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  buildNumericAssertion,
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
} from "@testing/harnesses/literal/snippets";

import { indexSources, testOccurrences } from "@testing/harnesses/literal-reuse/detection";

describe("literal-reuse detection — scenarios", () => {
  it("string literal carrying domain meaning in a src file and a test file produces a src↔test reuse finding citing both locations", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(literal)]);
    const tests = testOccurrences([testFile, buildStringAssertion(literal)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: createEmptyLiteralAllowlist() });

    const finding = result.srcReuse.find((f) => f.value === literal);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.STRING);
    expect(finding?.test.file).toBe(testFile);
    expect(finding?.src.map((s) => s.file)).toContain(sourceFile);
    expect(result.testDupe).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
  });

  it("string literal in two or more test files with no source occurrence produces a test↔test duplication finding citing every test location", () => {
    const inputs = sampleLiteralTestValue(arbitraryLiteralReuseFixtureInputs());

    const srcIndex = indexSources([inputs.reuseSourceFile, buildStringDeclaration(inputs.reuseLiteral)]);
    const tests = testOccurrences(
      [inputs.dupeFirstTestFile, buildStringAssertion(inputs.dupeLiteral)],
      [inputs.dupeSecondTestFile, buildStringAssertion(inputs.dupeLiteral)],
    );

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: createEmptyLiteralAllowlist() });

    const findings = result.testDupe.filter((f) => f.value === inputs.dupeLiteral);
    expect(findings.length).toBeGreaterThanOrEqual(LITERAL_TEST_GENERATOR_COUNTS.one);
    const cited = new Set<string>();
    for (const finding of findings) {
      cited.add(finding.test.file);
      for (const other of finding.otherTests) cited.add(other.file);
    }
    expect(cited.has(inputs.dupeFirstTestFile)).toBe(true);
    expect(cited.has(inputs.dupeSecondTestFile)).toBe(true);
  });

  it("numeric literal of meaningful magnitude duplicating between source and test produces a src↔test reuse finding", () => {
    const numericLiteral = sampleLiteralTestValue(arbitraryDomainNumber());
    const literalText = String(numericLiteral);
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildNumericDeclaration(literalText)]);
    const tests = testOccurrences([testFile, buildNumericAssertion(literalText)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: createEmptyLiteralAllowlist() });

    const finding = result.srcReuse.find((f) => f.value === literalText);
    expect(finding).toBeDefined();
    expect(finding?.kind).toBe(LITERAL_KIND.NUMBER);
  });

  it("literal value appearing exactly once in the codebase produces no problem for that value", () => {
    const [literal, otherLiteral] = sampleLiteralPair();
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const srcIndex = indexSources([sourceFile, buildStringDeclaration(literal)]);
    const tests = testOccurrences([testFile, buildStringAssertion(otherLiteral)]);

    const result = detectReuse({ srcIndex, testOccurrencesByFile: tests, allowlist: createEmptyLiteralAllowlist() });

    const reuseHits = result.srcReuse.filter((f) => f.value === literal);
    const dupeHits = result.testDupe.filter((f) => f.value === literal);
    expect(reuseHits).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
    expect(dupeHits).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
  });
});
