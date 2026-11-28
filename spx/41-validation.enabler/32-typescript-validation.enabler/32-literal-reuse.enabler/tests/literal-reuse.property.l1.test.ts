import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collectLiterals, DEFAULT_LITERAL_COLLECT_OPTIONS, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
} from "@testing/generators/literal/literal";
import { buildNumericDeclaration, buildStringDeclaration } from "@testing/generators/literal/snippets";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("domain literal generators", () => {
  it("domain-literal-indexed: every domain literal declared as a const string is indexed as exactly one string occurrence of that value", () => {
    assertProperty(
      fc.record({ value: arbitraryDomainLiteral(), sourceFile: arbitrarySourceFilePath() }),
      ({ value, sourceFile }) => {
        const occurrences = collectLiterals(buildStringDeclaration(value), sourceFile, DEFAULT_LITERAL_COLLECT_OPTIONS);

        expect(occurrences).toHaveLength(1);
        expect(occurrences[0]).toEqual(expect.objectContaining({ kind: LITERAL_KIND.STRING, value }));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.STANDARD },
    );
  });

  it("domain-number-indexed: every domain number declared as a const numeric is indexed as exactly one numeric occurrence of that value", () => {
    assertProperty(
      fc.record({ value: arbitraryDomainNumber(), sourceFile: arbitrarySourceFilePath() }),
      ({ value, sourceFile }) => {
        const occurrences = collectLiterals(
          buildNumericDeclaration(String(value)),
          sourceFile,
          DEFAULT_LITERAL_COLLECT_OPTIONS,
        );

        expect(occurrences).toHaveLength(1);
        expect(occurrences[0]).toEqual(expect.objectContaining({ kind: LITERAL_KIND.NUMBER, value: String(value) }));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.STANDARD },
    );
  });
});
