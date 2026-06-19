import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CONTROL_CHAR_UPPER_BOUND,
  DEL_CHAR_CODE,
  ELLIPSIS_TOKEN,
  escapeCliArgument,
  FIRST_PRINTABLE_CHAR_CODE,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  sanitizeCliArgument,
} from "@/lib/sanitize-cli-argument";

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

  it("overlong input is truncated to the display bound and ends with ELLIPSIS_TOKEN", () => {
    fc.assert(
      fc.property(
        fc.string({
          minLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1,
          maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH * 4,
        }),
        (input) => {
          const output = sanitizeCliArgument(input);
          expect(output.length).toBe(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
          expect(output.endsWith(ELLIPSIS_TOKEN)).toBe(true);
        },
      ),
    );
  });

  it("bounded printable input is preserved", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH })
          .filter((input) =>
            [...input].every((char) => {
              const code = char.codePointAt(0);
              return code !== undefined && code > CONTROL_CHAR_UPPER_BOUND && code !== DEL_CHAR_CODE;
            })
          ),
        (input) => {
          expect(sanitizeCliArgument(input)).toBe(input);
        },
      ),
    );
  });

  it("escape-only output does not apply the display-length bound to printable input", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: FIRST_PRINTABLE_CHAR_CODE, max: DEL_CHAR_CODE - 1 }),
          {
            minLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1,
            maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH * 4,
          },
        ).map((codes) => String.fromCodePoint(...codes)),
        (input) => {
          const output = escapeCliArgument(input);
          expect(output).toBe(input);
          expect(output.length).toBeGreaterThan(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
        },
      ),
    );
  });
});
