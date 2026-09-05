import { AGENT_SESSION_STORE } from "../protocol";

/** A transcript's text as the bytes its store records. */
export function encodeTranscriptText(text: string): Uint8Array {
  return Buffer.from(text, AGENT_SESSION_STORE.TEXT_ENCODING);
}

/**
 * Whether a transcript's undecoded bytes carry a needle. UTF-8 is self-synchronizing, so the
 * needle's encoded bytes occur in the transcript exactly when the needle occurs in its decoded
 * text; deciding candidacy here defers the decode without changing which transcripts qualify.
 */
export function transcriptBytesCarry(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
    needle,
    0,
    AGENT_SESSION_STORE.TEXT_ENCODING,
  );
}

export function transcriptBytesCarryEvery(bytes: Uint8Array, needles: readonly string[]): boolean {
  return needles.every((needle) => transcriptBytesCarry(bytes, needle));
}
