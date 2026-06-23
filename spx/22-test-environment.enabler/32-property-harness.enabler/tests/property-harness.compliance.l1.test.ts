import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveSeed } from "@testing/harnesses/property/property";

// These cases exercise the pure resolveSeed directly through fc.check plus an explicit
// expect — not assertProperty — so each it block carries a recognized assertion (SonarCloud
// S2699); a counterexample surfaces in the toBeNull failure for this pure-function check.
describe("an unset SPX_PROPERTY_SEED never resolves to a fixed constant", () => {
  it("follows the drawn seed when the variable is absent", () => {
    const details = fc.check(fc.property(fc.integer(), (drawn) => resolveSeed({}, () => drawn) === drawn));
    expect(details.counterexample).toBeNull();
  });

  it("yields distinct seeds for distinct draws, so successive runs explore different cases", () => {
    const details = fc.check(
      fc.property(fc.integer(), fc.integer(), (first, second) => {
        fc.pre(first !== second);
        const resolvedFirst = resolveSeed({}, () => first);
        const resolvedSecond = resolveSeed({}, () => second);
        return resolvedFirst === first && resolvedSecond === second && resolvedFirst !== resolvedSecond;
      }),
    );
    expect(details.counterexample).toBeNull();
  });
});
