import { describe, expect, it } from "vitest";

import { SCOPE_GRAMMAR_MAPPING } from "@testing/fixtures/verify/record-run/scope-grammar";
import {
  inspectVerificationStartScopeGrammar,
  observeVerificationScopeOptionMappings,
} from "@testing/harnesses/verify/harness";

const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const flagOf = (optionExpression: string | undefined): string | undefined => optionExpression?.split(" ")[0];

describe("record-run scope option mapping", () => {
  it("passes every supported selector through the caller-driven command path", async () => {
    await observeVerificationScopeOptionMappings().then((observations) => {
      observations.forEach(
        (
          {
            expectedResolvedScope,
            expectedSubject,
            recordedOptions,
            reportFields,
            resolvedScope,
            scope,
            scopeType,
            subject,
          },
        ) => {
          expect(recordedOptions).toMatchObject([{
            scopeType,
            scope,
          }]);
          expect(subject).toStrictEqual(expectedSubject);
          expect(resolvedScope).toStrictEqual(expectedResolvedScope);
          expect(reportFields).toContain(SCOPE_GRAMMAR_MAPPING.resolvedScopeField);
        },
      );
      // Every public form is observed, and no scope type carries a report field of its own: the
      // result of every selector has the same fields.
      expect(observations.map(({ scopeType }) => scopeType)).toEqual(
        expect.arrayContaining(SCOPE_GRAMMAR_MAPPING.forms.map((form) => form.scopeType)),
      );
      const fieldSets = observations.map(({ reportFields }) => [...reportFields].sort(compareCodeUnits));
      fieldSets.forEach((fields) => {
        expect(fields).toEqual(fieldSets[0]);
      });
    });
  });

  // Help that misstated the grammar would mislead a caller choosing a selector: the scope-type option
  // names every public scope type, and the scope option names the scope-identity term of every form.
  it("describes both public scope grammar forms", () => {
    const grammar = inspectVerificationStartScopeGrammar();

    expect(flagOf(grammar.scopeTypeFlags)).toBe(SCOPE_GRAMMAR_MAPPING.scopeTypeFlag);
    expect(flagOf(grammar.scopeFlags)).toBe(SCOPE_GRAMMAR_MAPPING.scopeFlag);
    for (const form of SCOPE_GRAMMAR_MAPPING.forms) {
      expect(grammar.scopeTypeDescription).toContain(form.scopeType);
      expect(grammar.scopeDescription).toContain(form.scopeTerm);
    }
  });
});
