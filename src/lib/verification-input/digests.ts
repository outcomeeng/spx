import { createHash } from "node:crypto";

export const CONTENT_NORMALIZATION = {
  NONE: "none",
  UTF8_UNIVERSAL_NEWLINES: "utf8-universal-newlines",
} as const;

export type ContentNormalization = (typeof CONTENT_NORMALIZATION)[keyof typeof CONTENT_NORMALIZATION];

export const UNIVERSAL_NEWLINE_DIGEST_VERSION = 1;

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const LINE_FEED = "\n";
const CARRIAGE_RETURN_OR_CRLF = /\r\n|\r/g;

export interface RawBytesDigest {
  readonly sha256: string;
}

export interface UniversalNewlineDigest {
  readonly version: typeof UNIVERSAL_NEWLINE_DIGEST_VERSION;
  readonly sha256: string;
}

export interface ContentDigests {
  readonly [CONTENT_NORMALIZATION.NONE]: RawBytesDigest;
  readonly [CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]: UniversalNewlineDigest;
}

function sha256Hex(content: Uint8Array | string): string {
  return createHash(SHA256_ALGORITHM).update(content).digest(HEX_ENCODING);
}

/** Lowercase hexadecimal SHA-256 of the raw bytes. */
export function digestRawBytes(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** Replaces each CRLF and each lone CR with LF. */
export function normalizeUniversalNewlines(text: string): string {
  return text.replace(CARRIAGE_RETURN_OR_CRLF, LINE_FEED);
}

/** SHA-256 of the UTF-8 encoding of the text after universal-newline normalization. */
export function digestUniversalNewlineText(text: string): string {
  return sha256Hex(normalizeUniversalNewlines(text));
}

export function computeContentDigests(bytes: Uint8Array, text: string): ContentDigests {
  return {
    [CONTENT_NORMALIZATION.NONE]: { sha256: digestRawBytes(bytes) },
    [CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]: {
      version: UNIVERSAL_NEWLINE_DIGEST_VERSION,
      sha256: digestUniversalNewlineText(text),
    },
  };
}
