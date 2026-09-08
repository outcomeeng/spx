import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEL_CHAR_CODE,
  ELLIPSIS_TOKEN,
  FIRST_PRINTABLE_CHAR_CODE,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
} from "@/lib/sanitize-cli-argument";
import {
  authoredText,
  externalToken,
  externalValue,
  joinTerminalText,
  jsonDocument,
  renderTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("terminal text composition invariants", () => {
  it("renders an external segment with no control byte and no DEL", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      for (const char of renderTerminalText(terminal`${externalValue(input)}`)) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
        expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("reproduces an authored segment byte-for-byte so product styling and line structure survive", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      expect(renderTerminalText(terminal`${authoredText(input)}`)).toBe(input);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("preserves the authored literal segments of a composition around its escaped values", () => {
    assertProperty(
      fc.tuple(arbitraryTerminalUnsafeText(), arbitraryTerminalUnsafeText()),
      ([label, value]) => {
        expect(renderTerminalText(terminal`${authoredText(label)}: ${externalValue(value)}`)).toBe(
          `${label}: ${renderTerminalText(externalValue(value))}`,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("carries an authored segment through an enclosing composition without escaping it", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      expect(renderTerminalText(terminal`${terminal`${authoredText(input)}`}`)).toBe(input);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("joins already-composed parts around an authored separator without touching any of them", () => {
    assertProperty(
      fc.tuple(arbitraryTerminalUnsafeText(), fc.array(arbitraryTerminalUnsafeText(), { minLength: 1, maxLength: 5 })),
      ([separator, inputs]) => {
        // Parts alternate between authored and external so the join has both kinds to keep intact.
        const parts: TerminalText[] = inputs.map((input, index) =>
          index % 2 === 0 ? authoredText(input) : externalValue(input)
        );
        // The native join over the rendered parts is the oracle: it never sees the primitive.
        expect(renderTerminalText(joinTerminalText(authoredText(separator), parts))).toBe(
          parts.map((part) => renderTerminalText(part)).join(separator),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("bounds an external display token to the display length, escaped, and ends a truncated one in the ellipsis", () => {
    assertProperty(
      fc.tuple(arbitraryTerminalUnsafeText(), fc.integer({ min: 1, max: MAX_CLI_ARGUMENT_DISPLAY_LENGTH })),
      ([input, repeat]) => {
        const value = input.repeat(repeat);
        const rendered = renderTerminalText(externalToken(value));
        for (const char of rendered) {
          expect(char.codePointAt(0)).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
          expect(char.codePointAt(0)).not.toBe(DEL_CHAR_CODE);
        }
        expect(rendered.length).toBeLessThanOrEqual(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
        // The unbounded escape is the oracle for whether the bound had to cut: a value whose
        // escaped form exceeds the display length ends in the ellipsis, and one within it does not.
        const unbounded = renderTerminalText(externalValue(value));
        expect(rendered.endsWith(ELLIPSIS_TOKEN)).toBe(unbounded.length > MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("serializes a JSON document with no control byte or DEL outside its line structure that parses back unchanged", () => {
    const LINE_FEED_CODE_POINT = 0x0a;
    assertProperty(
      fc.tuple(
        fc.dictionary(arbitraryTerminalUnsafeText(), arbitraryTerminalUnsafeText(), { noNullPrototype: true }),
        fc.integer({ min: 0, max: 4 }),
      ),
      ([value, indent]) => {
        const document = renderTerminalText(jsonDocument(value, indent));
        for (const char of document) {
          const codePoint = char.codePointAt(0);
          if (codePoint !== LINE_FEED_CODE_POINT) {
            expect(codePoint).toBeGreaterThanOrEqual(FIRST_PRINTABLE_CHAR_CODE);
          }
          expect(codePoint).not.toBe(DEL_CHAR_CODE);
        }
        expect(JSON.parse(document)).toStrictEqual(value);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("does not escape an external value twice when composed text is composed again", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      expect(renderTerminalText(terminal`${terminal`${externalValue(input)}`}`)).toBe(
        renderTerminalText(terminal`${externalValue(input)}`),
      );
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
