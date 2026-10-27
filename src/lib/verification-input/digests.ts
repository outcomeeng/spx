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

/** The content digests available for bytes: always `none`, and the universal-newline digest only when the bytes are valid UTF-8. */
export interface AvailableContentDigests {
  readonly [CONTENT_NORMALIZATION.NONE]: RawBytesDigest;
  readonly [CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES]?: UniversalNewlineDigest;
}

const UTF8_LABEL = "utf-8";

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

/** The text strict UTF-8 decoding yields for the bytes, keeping a byte-order mark; `undefined` when the bytes are not valid UTF-8. */
export function decodeStrictUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder(UTF8_LABEL, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** The text a lenient UTF-8 decoding yields for the bytes, keeping a byte-order mark and replacing each invalid sequence. */
export function decodeLenientUtf8(bytes: Uint8Array): string {
  return new TextDecoder(UTF8_LABEL, { fatal: false, ignoreBOM: true }).decode(bytes);
}

/** Digests of the bytes under every normalization that applies to them. */
export function computeAvailableContentDigests(bytes: Uint8Array): AvailableContentDigests {
  const text = decodeStrictUtf8(bytes);
  if (text === undefined) return { [CONTENT_NORMALIZATION.NONE]: { sha256: digestRawBytes(bytes) } };
  return computeContentDigests(bytes, text);
}

/** The digest of the bytes under a normalization, or `undefined` when the normalization does not apply to them. */
export function digestUnderNormalization(bytes: Uint8Array, normalization: ContentNormalization): string | undefined {
  if (normalization === CONTENT_NORMALIZATION.NONE) return digestRawBytes(bytes);
  const text = decodeStrictUtf8(bytes);
  return text === undefined ? undefined : digestUniversalNewlineText(text);
}
