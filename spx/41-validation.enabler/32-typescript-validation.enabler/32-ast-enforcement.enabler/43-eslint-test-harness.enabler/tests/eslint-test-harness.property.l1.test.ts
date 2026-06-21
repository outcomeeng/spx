import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { severityOf } from "@testing/harnesses/validation/eslint";

describe("eslint rule-tester harness — severityOf", () => {
  it("reads a numeric rule config as its severity", () => {
    fc.assert(
      fc.property(fc.integer(), (severity) => {
        expect(severityOf(severity)).toBe(severity);
      }),
    );
  });

  it("reads an array rule config's numeric head as its severity", () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.anything()), (severity, options) => {
        expect(severityOf([severity, ...options])).toBe(severity);
      }),
    );
  });

  it("reads any other rule config as no severity", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(severityOf(name)).toBeUndefined();
        expect(severityOf([name])).toBeUndefined();
      }),
    );
  });
});
