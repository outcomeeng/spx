import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ELLIPSIS_TOKEN,
  escapeCliArgument,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  sanitizeCliArgument,
} from "@/lib/sanitize-cli-argument";
import {
  arbitraryPrintableCodePoint,
  arbitraryTerminalText,
  TERMINAL_ORACLE,
} from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

/** Printable text within the display bound, so the sanitizer neither escapes nor truncates it. */
const arbitraryBoundedPrintableText = (): fc.Arbitrary<string> =>
  fc
    .array(arbitraryPrintableCodePoint(), { minLength: 1, maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH })
    .map((codePoints) => String.fromCodePoint(...codePoints));

/** Printable text past the display bound, so only the bound itself is in question. */
const arbitraryOverlongPrintableText = (): fc.Arbitrary<string> =>
  fc
    .array(arbitraryPrintableCodePoint(), {
      minLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1,
      maxLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH * 4,
    })
    .map((codePoints) => String.fromCodePoint(...codePoints));

describe("sanitizeCliArgument invariants", () => {
  it("is idempotent: applying sanitize to its own output returns the same string", () => {
    assertProperty(arbitraryTerminalText(), (input) => {
      const once = sanitizeCliArgument(input);
      const twice = sanitizeCliArgument(once);
      expect(twice).toBe(once);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("output contains no code point below the first printable byte and never DEL", () => {
    assertProperty(arbitraryTerminalText(), (input) => {
      const output = sanitizeCliArgument(input);
      for (const char of output) {
        const code = char.codePointAt(0);
        if (code === undefined) continue;
        expect(code).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(code).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("output length never exceeds MAX_CLI_ARGUMENT_DISPLAY_LENGTH", () => {
    assertProperty(arbitraryTerminalText(), (input) => {
      expect(sanitizeCliArgument(input).length).toBeLessThanOrEqual(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("overlong input is truncated to the display bound and ends with ELLIPSIS_TOKEN", () => {
    assertProperty(arbitraryOverlongPrintableText(), (input) => {
      const output = sanitizeCliArgument(input);
      expect(output.length).toBe(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      expect(output.endsWith(ELLIPSIS_TOKEN)).toBe(true);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("bounded printable input is preserved", () => {
    assertProperty(arbitraryBoundedPrintableText(), (input) => {
      expect(sanitizeCliArgument(input)).toBe(input);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("escape-only output does not apply the display-length bound to printable input", () => {
    assertProperty(arbitraryOverlongPrintableText(), (input) => {
      const output = escapeCliArgument(input);
      expect(output).toBe(input);
      expect(output.length).toBeGreaterThan(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
