import { describe, expect, it } from "vitest";

import {
  createEmptyLiteralAllowlist,
  detectReuse,
  LITERAL_KIND,
  REMEDIATION,
  validateLiteralReuse,
} from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitrarySpecTreeLiteralReuseFixtureInputs,
  arbitrarySpecTreeLiteralSourceReuseFixtureInputs,
  arbitraryTestFilePath,
  LITERAL_TEST_GENERATOR_COUNTS,
  literalEmptyConfig,
  sampleLiteralPair,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  buildNumericAssertion,
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
} from "@testing/generators/literal/snippets";

import { indexSources, testOccurrences } from "@testing/harnesses/literal-reuse/detection";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

describe("literal-reuse detection — scenarios", () => {
  it("string literal carrying domain meaning in a src file and a test file produces a src↔test reuse finding citing both locations", async () => {
    const inputs = sampleLiteralTestValue(arbitrarySpecTreeLiteralSourceReuseFixtureInputs());

    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeSourceReuseFixture(inputs);
      const result = await validateLiteralReuse({ productDir: env.productDir });

      const finding = result.findings.srcReuse.find((candidate) => candidate.value === inputs.literal);
      expect(finding).toBeDefined();
      expect(finding?.kind).toBe(LITERAL_KIND.STRING);
      expect(finding?.test.file).toBe(inputs.testFile);
      expect(finding?.src.map((location) => location.file)).toContain(inputs.sourceFile);
      expect(result.findings.testDupe).toHaveLength(LITERAL_TEST_GENERATOR_COUNTS.none);
    });
  });

  it("string literal in two or more test files with no source occurrence produces a test↔test duplication finding citing every test location", async () => {
    const inputs = sampleLiteralTestValue(arbitrarySpecTreeLiteralReuseFixtureInputs());

    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      await env.writeReuseFixture(inputs);
      const result = await validateLiteralReuse({ productDir: env.productDir });

      const findings = result.findings.testDupe.filter((candidate) => candidate.value === inputs.dupeLiteral);
      expect(findings.length).toBeGreaterThanOrEqual(LITERAL_TEST_GENERATOR_COUNTS.one);
      const cited = new Set<string>();
      for (const finding of findings) {
        expect(finding.remediation).toBe(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR);
        cited.add(finding.test.file);
        for (const other of finding.otherTests) cited.add(other.file);
      }
      expect(cited.has(inputs.dupeFirstTestFile)).toBe(true);
      expect(cited.has(inputs.dupeSecondTestFile)).toBe(true);
    });
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
