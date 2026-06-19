import { describe, expect, it } from "vitest";

import {
  CONTROL_CHAR_UPPER_BOUND,
  DEL_CHAR_CODE,
  escapeCliArgument,
  formatHexEscape,
  sanitizeCliArgument,
} from "@/lib/sanitize-cli-argument";

describe("control-character input maps to its hex escape", () => {
  it.each([
    ...Array.from({ length: CONTROL_CHAR_UPPER_BOUND + 1 }, (_, code) => code),
    DEL_CHAR_CODE,
  ])(
    "maps code point %s to its source-owned escape",
    (code) => {
      const input = String.fromCodePoint(code);
      expect(sanitizeCliArgument(input)).toBe(formatHexEscape(code));
      expect(escapeCliArgument(input)).toBe(formatHexEscape(code));
    },
  );
});
