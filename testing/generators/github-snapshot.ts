import fc from "fast-check";

/**
 * A filesystem- and GitHub-API-safe run token, mirroring the slug-safe run
 * tokens the state store produces. GitHub Actions artifact names and cache keys
 * reject whitespace and many punctuation characters, so the snapshot-sink tests
 * generate tokens from the same safe alphabet the real run tokens use.
 */
export const arbitraryRunToken = (): fc.Arbitrary<string> => fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,39}$/);
