import { describe, expect, it } from "vitest";

import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { verifyScopeMappingCases } from "@testing/generators/verify/verify";
import { observeScopeTypeMapping } from "@testing/harnesses/verify/harness";

describe("verify scope mapping", () => {
  it("maps every scope type the scope-type registry supports", () => {
    expect(new Set(verifyScopeMappingCases().map((mapping) => mapping.scopeType))).toStrictEqual(
      new Set(Object.values(VERIFY_SCOPE_TYPE)),
    );
  });

  it.each(verifyScopeMappingCases())(
    "maps the $scopeType scope to a reconstructable subject and resolved scope",
    async (mapping) => {
      await observeScopeTypeMapping(mapping).then((observed) => {
        expect(observed.resolvedScope).toEqual(mapping.expectedResolvedScope);
        expect(observed.subject).toEqual(mapping.expectedSubject);
      });
    },
  );
});
