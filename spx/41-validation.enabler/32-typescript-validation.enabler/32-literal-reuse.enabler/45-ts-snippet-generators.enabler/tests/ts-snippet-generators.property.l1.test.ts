import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collectLiterals, DEFAULT_LITERAL_COLLECT_OPTIONS, LITERAL_KIND } from "@/validation/literal/index";
import {
  arbitraryDomainLiteral,
  arbitraryDomainNumber,
  arbitrarySourceFilePath,
  arbitraryTestFilePath,
} from "@testing/generators/literal/literal";
import {
  buildNumericAssertion,
  buildNumericDeclaration,
  buildStringAssertion,
  buildStringDeclaration,
  buildTemplateDeclaration,
} from "@testing/harnesses/literal/snippets";

describe("snippet builders — round-trip: output is indexed by the literal detector", () => {
  it("buildStringDeclaration output yields a STRING occurrence with the original value", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), arbitrarySourceFilePath(), (value, filename) => {
        const occurrences = collectLiterals(buildStringDeclaration(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
        expect(occurrences.some((o) => o.kind === LITERAL_KIND.STRING && o.value === value)).toBe(true);
      }),
    );
  });

  it("buildNumericDeclaration output yields a NUMBER occurrence with the original value", () => {
    fc.assert(
      fc.property(arbitraryDomainNumber(), arbitrarySourceFilePath(), (n, filename) => {
        const numStr = String(n);
        const occurrences = collectLiterals(buildNumericDeclaration(numStr), filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
        expect(occurrences.some((o) => o.kind === LITERAL_KIND.NUMBER && o.value === numStr)).toBe(true);
      }),
    );
  });

  it("buildTemplateDeclaration output yields a STRING occurrence with the original value", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), arbitrarySourceFilePath(), (value, filename) => {
        const occurrences = collectLiterals(buildTemplateDeclaration(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
        expect(occurrences.some((o) => o.kind === LITERAL_KIND.STRING && o.value === value)).toBe(true);
      }),
    );
  });

  it("buildStringAssertion output yields a STRING occurrence with the original value", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), arbitraryTestFilePath(), (value, filename) => {
        const occurrences = collectLiterals(buildStringAssertion(value), filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
        expect(occurrences.some((o) => o.kind === LITERAL_KIND.STRING && o.value === value)).toBe(true);
      }),
    );
  });

  it("buildNumericAssertion output yields a NUMBER occurrence with the original value", () => {
    fc.assert(
      fc.property(arbitraryDomainNumber(), arbitraryTestFilePath(), (n, filename) => {
        const numStr = String(n);
        const occurrences = collectLiterals(buildNumericAssertion(numStr), filename, DEFAULT_LITERAL_COLLECT_OPTIONS);
        expect(occurrences.some((o) => o.kind === LITERAL_KIND.NUMBER && o.value === numStr)).toBe(true);
      }),
    );
  });
});

describe("snippet builders — purity", () => {
  it("buildStringDeclaration is pure: same value produces byte-equal output", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (value) => {
        expect(buildStringDeclaration(value)).toBe(buildStringDeclaration(value));
      }),
    );
  });

  it("buildNumericDeclaration is pure: same numStr produces byte-equal output", () => {
    fc.assert(
      fc.property(arbitraryDomainNumber(), (n) => {
        const numStr = String(n);
        expect(buildNumericDeclaration(numStr)).toBe(buildNumericDeclaration(numStr));
      }),
    );
  });

  it("buildTemplateDeclaration is pure: same value produces byte-equal output", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (value) => {
        expect(buildTemplateDeclaration(value)).toBe(buildTemplateDeclaration(value));
      }),
    );
  });

  it("buildStringAssertion is pure: same value produces byte-equal output", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (value) => {
        expect(buildStringAssertion(value)).toBe(buildStringAssertion(value));
      }),
    );
  });

  it("buildNumericAssertion is pure: same numStr produces byte-equal output", () => {
    fc.assert(
      fc.property(arbitraryDomainNumber(), (n) => {
        const numStr = String(n);
        expect(buildNumericAssertion(numStr)).toBe(buildNumericAssertion(numStr));
      }),
    );
  });
});
