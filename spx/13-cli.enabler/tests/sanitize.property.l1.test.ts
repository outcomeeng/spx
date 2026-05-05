import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEL_CHAR_CODE,
  FIRST_PRINTABLE_CHAR_CODE,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  sanitizeCliArgument,
} from "@/interfaces/cli/sanitize";

describe("sanitizeCliArgument invariants", () => {
  it("is idempotent: applying sanitize to its own output returns the same string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = sanitizeCliArgument(input);
        const twice = sanitizeCliArgument(once);
        expect(twice).toBe(once);
      }),
    );
  });

  it("output contains no code point below FIRST_PRINTABLE_CHAR_CODE and never DEL_CHAR_CODE", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const output = sanitizeCliArgument(input);
        for (const char of output) {
          const code = char.codePointAt(0);
          if (code === undefined) continue;
          expect(code).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
          expect(code).not.toBe(DEL_CHAR_CODE);
        }
      }),
    );
  });

  it("output length never exceeds MAX_CLI_ARGUMENT_DISPLAY_LENGTH", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(sanitizeCliArgument(input).length).toBeLessThanOrEqual(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      }),
    );
  });
});
