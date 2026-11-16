/**
 * The Node.js names an independent test oracle passes to `node:crypto` and `Buffer` to digest text:
 * the SHA-256 hash algorithm, the hexadecimal digest encoding, and the UTF-8 text encoding. They are
 * owned here, by the test infrastructure, so an oracle that recomputes a digest does not borrow the
 * constants of the production digest it checks.
 */
export const TEST_DIGEST_NAME = {
  SHA256_ALGORITHM: "sha256",
  HEX_ENCODING: "hex",
  UTF8_ENCODING: "utf8",
} as const;
