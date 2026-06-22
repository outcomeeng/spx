import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveColorChoice } from "@/lib/styled-output/styled-output";

describe("the color choice resolves by precedence: flag, then NO_COLOR, then TTY", () => {
  it("honors an explicit flag over NO_COLOR and TTY", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.option(fc.string(), { nil: undefined }), fc.boolean(), (flag, noColor, isTty) => {
        expect(resolveColorChoice({ flag, noColor, isTty })).toBe(flag);
      }),
    );
  });

  it("disables color when no flag is set and NO_COLOR is non-empty", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.boolean(), (noColor, isTty) => {
        expect(resolveColorChoice({ flag: undefined, noColor, isTty })).toBe(false);
      }),
    );
  });

  it("falls back to TTY status when no flag is set and NO_COLOR is unset or empty", () => {
    fc.assert(
      fc.property(fc.constantFrom(undefined, ""), fc.boolean(), (noColor, isTty) => {
        expect(resolveColorChoice({ flag: undefined, noColor, isTty })).toBe(isTty);
      }),
    );
  });
});
