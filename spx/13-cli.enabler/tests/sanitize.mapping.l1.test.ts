import { describe, expect, it } from "vitest";

import { escapeCliArgument, sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import {
  TERMINAL_ORACLE_UNSAFE_CODE_POINTS,
  terminalOracleHexEscape,
} from "@testing/generators/terminal-text/terminal-text";

describe("control-character input maps to its hex escape", () => {
  it.each([...TERMINAL_ORACLE_UNSAFE_CODE_POINTS])(
    "maps code point %s to its hex escape",
    (code) => {
      const input = String.fromCodePoint(code);
      expect(sanitizeCliArgument(input)).toBe(terminalOracleHexEscape(code));
      expect(escapeCliArgument(input)).toBe(terminalOracleHexEscape(code));
    },
  );
});
