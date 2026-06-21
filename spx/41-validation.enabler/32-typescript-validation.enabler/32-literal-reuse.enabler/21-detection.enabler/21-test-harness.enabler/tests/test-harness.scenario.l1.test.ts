import { describe, expect, it } from "vitest";

import { LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { collectFromSource } from "@testing/harnesses/literal-reuse/detection";
import { buildStringDeclaration } from "@testing/harnesses/literal/snippets";

describe("literal-reuse detection test harness — scenarios", () => {
  it("collectFromSource finds a string literal carried by a source snippet", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());

    const occurrences = collectFromSource(buildStringDeclaration(literal), sourceFile);

    expect(occurrences.some((occurrence) => occurrence.kind === LITERAL_KIND.STRING && occurrence.value === literal))
      .toBe(true);
  });
});
