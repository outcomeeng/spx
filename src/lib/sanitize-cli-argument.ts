export const MAX_CLI_ARGUMENT_DISPLAY_LENGTH = 120;
export const ELLIPSIS_TOKEN = "...";

export const SENTINEL_UNDEFINED = "<undefined>";
export const SENTINEL_NULL = "<null>";
export const SENTINEL_EMPTY = "<empty>";

export const CONTROL_CHAR_UPPER_BOUND = 0x1f;
export const DEL_CHAR_CODE = 0x7f;
export const FIRST_PRINTABLE_CHAR_CODE = 0x20;

export const HEX_RADIX = 16;
export const HEX_PAD = 2;

export function formatHexEscape(code: number): string {
  return `\\x${code.toString(HEX_RADIX).padStart(HEX_PAD, "0")}`;
}

export function nonStringSentinel(type: string): string {
  return `<non-string:${type}>`;
}

export function sanitizeCliArgument(input: unknown): string {
  if (input === undefined) return SENTINEL_UNDEFINED;
  if (input === null) return SENTINEL_NULL;
  if (typeof input !== "string") return nonStringSentinel(typeof input);
  if (input.length === 0) return SENTINEL_EMPTY;

  const escaped = escapeControlCharacters(input);
  return truncate(escaped);
}

function escapeControlCharacters(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code <= CONTROL_CHAR_UPPER_BOUND || code === DEL_CHAR_CODE) {
      out += formatHexEscape(code);
    } else {
      out += char;
    }
  }
  return out;
}

function truncate(value: string): string {
  if (value.length <= MAX_CLI_ARGUMENT_DISPLAY_LENGTH) return value;
  return value.slice(0, MAX_CLI_ARGUMENT_DISPLAY_LENGTH - ELLIPSIS_TOKEN.length) + ELLIPSIS_TOKEN;
}
