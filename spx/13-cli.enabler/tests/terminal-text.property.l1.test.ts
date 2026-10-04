import { describe, expect, it } from "vitest";

import { ELLIPSIS_TOKEN, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import {
  authoredText,
  externalToken,
  externalValue,
  joinTerminalText,
  jsonDocument,
  renderTerminalText,
  terminal,
} from "@/lib/terminal-text/terminal-text";
import {
  arbitraryExternalTokenCase,
  arbitraryTerminalJoinCase,
  arbitraryTerminalJsonDocumentCase,
  arbitraryTerminalLabelledValueCase,
  arbitraryTerminalUnsafeText,
  TERMINAL_ORACLE,
} from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("terminal text composition invariants", () => {
  it("renders an external segment with no control byte and no DEL", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      for (const char of renderTerminalText(terminal`${externalValue(input)}`)) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
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
      arbitraryTerminalLabelledValueCase(),
      ({ label, value }) => {
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
    assertProperty(arbitraryTerminalJoinCase(), ({ separator, parts }) => {
      // The native join over the rendered parts is the oracle: it never sees the primitive.
      expect(renderTerminalText(joinTerminalText(authoredText(separator), parts))).toBe(
        parts.map((part) => renderTerminalText(part)).join(separator),
      );
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("bounds an external display token to the display length, escaped, and ends a truncated one in the ellipsis", () => {
    assertProperty(arbitraryExternalTokenCase(), ({ input, escaped }) => {
      const rendered = renderTerminalText(externalToken(input));
      for (const char of rendered) {
        expect(char.codePointAt(0)).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        expect(char.codePointAt(0)).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
      expect(rendered.length).toBeLessThanOrEqual(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      // Whether the bound had to cut is decided by the independently escaped form, whose length
      // is never computed by the escaper under test.
      expect(rendered.endsWith(ELLIPSIS_TOKEN)).toBe(escaped.length > MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("serializes a JSON document with no control byte or DEL outside its line structure that parses back unchanged", () => {
    assertProperty(arbitraryTerminalJsonDocumentCase(), ({ value, indent }) => {
      const document = renderTerminalText(jsonDocument(value, indent));
      for (const char of document) {
        const codePoint = char.codePointAt(0);
        if (codePoint !== TERMINAL_ORACLE.LINE_FEED_CODE_POINT) {
          expect(codePoint).toBeGreaterThanOrEqual(TERMINAL_ORACLE.FIRST_PRINTABLE_CODE_POINT);
        }
        expect(codePoint).not.toBe(TERMINAL_ORACLE.DEL_CODE_POINT);
      }
      expect(JSON.parse(document)).toStrictEqual(value);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("does not escape an external value twice when composed text is composed again", () => {
    assertProperty(arbitraryTerminalUnsafeText(), (input) => {
      expect(renderTerminalText(terminal`${terminal`${externalValue(input)}`}`)).toBe(
        renderTerminalText(terminal`${externalValue(input)}`),
      );
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
