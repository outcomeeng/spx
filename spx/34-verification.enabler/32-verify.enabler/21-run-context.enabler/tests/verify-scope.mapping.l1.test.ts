import { describe, expect, it } from "vitest";

import { verifyScopeMappingCases } from "@testing/generators/verify/verify";
import { observeScopeTypeMapping } from "@testing/harnesses/verify/harness";

describe("verify scope mapping", () => {
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
