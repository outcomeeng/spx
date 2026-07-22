import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import { authoredText, externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

describe("terminal text composition invariants", () => {
  it("renders an external segment with no control byte and no DEL", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        for (const char of renderTerminalText(terminal`${input}`)) {
          expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
          expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
        }
      }),
    );
  });

  it("reproduces an authored segment byte-for-byte so product styling and line structure survive", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(renderTerminalText(terminal`${authoredText(input)}`)).toBe(input);
      }),
    );
  });

  it("preserves the authored literal segments of a composition around its escaped values", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (label, value) => {
        expect(renderTerminalText(terminal`${authoredText(label)}: ${value}`)).toBe(
          `${label}: ${renderTerminalText(externalValue(value))}`,
        );
      }),
    );
  });

  it("does not escape a value twice when composed text is composed again", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(renderTerminalText(terminal`${terminal`${input}`}`)).toBe(renderTerminalText(terminal`${input}`));
      }),
    );
  });
});
