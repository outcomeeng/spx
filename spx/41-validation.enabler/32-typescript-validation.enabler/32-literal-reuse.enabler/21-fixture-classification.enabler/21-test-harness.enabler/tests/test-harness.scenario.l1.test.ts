import { describe, expect, it } from "vitest";

import { LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { collectFromFile } from "@testing/harnesses/literal-reuse/fixture-classification";
import { buildStringDeclaration } from "@testing/harnesses/literal/snippets";

describe("fixture-classification test harness — scenarios", () => {
  it("collectFromFile finds a string literal carried by a source snippet", () => {
    const literal = sampleLiteralTestValue(arbitraryDomainLiteral());
    const sourceFile = sampleLiteralTestValue(arbitrarySourceFilePath());

    const occurrences = collectFromFile(buildStringDeclaration(literal), sourceFile);

    expect(occurrences.some((occurrence) => occurrence.kind === LITERAL_KIND.STRING && occurrence.value === literal))
      .toBe(true);
  });
});
