// Built from the code point so the source never contains an invisible control byte.
const escCharCode = 27;

/** ANSI control introducer emitted by chalk when color output is enabled. */
export const ANSI_ESCAPE = String.fromCodePoint(escCharCode);

/** Matches ANSI SGR sequences for escape-stripped content and width assertions. */
export const ANSI_SGR_SEQUENCE = new RegExp(String.raw`${ANSI_ESCAPE}\[[0-9;]*m`, "g");

export function stripAnsi(value: string): string {
  return value.replaceAll(ANSI_SGR_SEQUENCE, "");
}
