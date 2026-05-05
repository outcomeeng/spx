import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CONTROL_CHAR_UPPER_BOUND,
  DEL_CHAR_CODE,
  ELLIPSIS_TOKEN,
  formatHexEscape,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  sanitizeCliArgument,
} from "@/interfaces/cli/sanitize";

describe("control-character input maps to its \\xNN escape", () => {
  it("for every code point in [0x00, CONTROL_CHAR_UPPER_BOUND], the sanitizer emits formatHexEscape(code)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: CONTROL_CHAR_UPPER_BOUND }), (code) => {
        const input = String.fromCodePoint(code);
        expect(sanitizeCliArgument(input)).toBe(formatHexEscape(code));
      }),
    );
  });

  it("for DEL_CHAR_CODE, the sanitizer emits formatHexEscape(DEL_CHAR_CODE)", () => {
    const input = String.fromCodePoint(DEL_CHAR_CODE);
    expect(sanitizeCliArgument(input)).toBe(formatHexEscape(DEL_CHAR_CODE));
  });
});

describe("length mapping", () => {
  it("returns input unchanged when length is at most MAX_CLI_ARGUMENT_DISPLAY_LENGTH", () => {
    const input = "x".repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    expect(sanitizeCliArgument(input)).toBe(input);
  });

  it("returns output of length exactly MAX_CLI_ARGUMENT_DISPLAY_LENGTH ending in ELLIPSIS_TOKEN when input exceeds the bound", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1, max: MAX_CLI_ARGUMENT_DISPLAY_LENGTH * 4 }),
        (length) => {
          const input = "x".repeat(length);
          const output = sanitizeCliArgument(input);
          expect(output.length).toBe(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
          expect(output.endsWith(ELLIPSIS_TOKEN)).toBe(true);
        },
      ),
    );
  });
});

describe("printable-input mappings", () => {
  it("returns the input unchanged for any string whose length is bounded and whose code points are printable and not DEL", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH })
          .filter((s) =>
            [...s].every((char) => {
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
});
