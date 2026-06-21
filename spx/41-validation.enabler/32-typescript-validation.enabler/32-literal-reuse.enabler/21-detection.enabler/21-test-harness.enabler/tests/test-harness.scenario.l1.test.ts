import { describe, expect, it } from "vitest";

import { createEmptyLiteralAllowlist, detectReuse, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { collectFromSource, indexSources, testOccurrences } from "@testing/harnesses/literal-reuse/detection";
import { buildStringAssertion, buildStringDeclaration } from "@testing/harnesses/literal/snippets";

describe("literal-reuse detection test harness — scenarios", () => {
  it("collectFromSource finds a string literal carried by a source snippet", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());

    const occurrences = collectFromSource(buildStringDeclaration(literal), sourceFile);

    expect(occurrences.some((occurrence) => occurrence.kind === LITERAL_KIND.STRING && occurrence.value === literal))
      .toBe(true);
  });

  it("indexSources and testOccurrences feed detectReuse to surface a shared literal as src-test reuse", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());
    const testFile = sampleLiteralTestValue(arbitraryTestFilePath());

    const result = detectReuse({
      srcIndex: indexSources([sourceFile, buildStringDeclaration(literal)]),
      testOccurrencesByFile: testOccurrences([testFile, buildStringAssertion(literal)]),
      allowlist: createEmptyLiteralAllowlist(),
    });

    expect(result.srcReuse.some((finding) => finding.value === literal)).toBe(true);
  });
});
