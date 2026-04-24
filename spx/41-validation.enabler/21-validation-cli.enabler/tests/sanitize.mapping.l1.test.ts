import { describe, expect, it } from "vitest";

import {
  CONTROL_CHAR_UPPER_BOUND,
  DEL_CHAR_CODE,
  ELLIPSIS_TOKEN,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  sanitizeCliArgument,
} from "@/lib/sanitize-cli-argument";

const HEX_RADIX = 16;
const HEX_PAD = 2;
const TRUNCATION_OVERFLOW = 50;

const CONTROL_CHAR_CODES: readonly number[] = [
  ...Array.from({ length: CONTROL_CHAR_UPPER_BOUND + 1 }, (_unused, i) => i),
  DEL_CHAR_CODE,
];

function escapeFor(code: number): string {
  return `\\x${code.toString(HEX_RADIX).padStart(HEX_PAD, "0")}`;
}

describe("control-character input maps to its \\xNN escape", () => {
  it.each(CONTROL_CHAR_CODES)("code point 0x%s", (code) => {
    const input = String.fromCodePoint(code);
    expect(sanitizeCliArgument(input)).toBe(escapeFor(code));
  });
});

describe("length mapping", () => {
  it("returns input unchanged when length is at most MAX_CLI_ARGUMENT_DISPLAY_LENGTH", () => {
    const input = "x".repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    expect(sanitizeCliArgument(input)).toBe(input);
  });

  it("returns output of length exactly MAX_CLI_ARGUMENT_DISPLAY_LENGTH ending in ELLIPSIS_TOKEN when input exceeds the bound", () => {
    const input = "x".repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH + TRUNCATION_OVERFLOW);
    const output = sanitizeCliArgument(input);
    expect(output.length).toBe(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    expect(output.endsWith(ELLIPSIS_TOKEN)).toBe(true);
  });
});

describe("printable-input mappings: representative Unicode and ASCII", () => {
  it.each([
    "hello-world_123",
    "café 日本語",
    "mixed 🎉 emoji",
  ])("passes %j through unchanged when bounded and printable", (input) => {
    expect(sanitizeCliArgument(input)).toBe(input);
  });
});
