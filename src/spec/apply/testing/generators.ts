/**
 * fast-check generators for apply-exclude tests.
 *
 * Generates valid spec-tree node paths matching the NN-slug.{type} pattern.
 */
import fc from "fast-check";

import { NODE_SUFFIXES } from "../exclude/constants";

/** Valid BSP range for node indices */
const MIN_BSP = 10;
const MAX_BSP = 99;

/** Characters valid in a node slug (lowercase letters and hyphens) */
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz-";

/** Minimum slug length */
const MIN_SLUG_LENGTH = 3;

/** Maximum slug length */
const MAX_SLUG_LENGTH = 30;

/**
 * Arbitrary that generates a valid node slug (lowercase, hyphenated).
 */
export function arbitrarySlug(): fc.Arbitrary<string> {
  return fc
    .string({
      unit: fc.constantFrom(...SLUG_CHARS.split("")),
      minLength: MIN_SLUG_LENGTH,
      maxLength: MAX_SLUG_LENGTH,
    })
    .filter((s) => !s.startsWith("-") && !s.endsWith("-") && !s.includes("--"));
}

/**
 * Arbitrary that generates a valid node type suffix (e.g., ".outcome/").
 */
export function arbitrarySuffix(): fc.Arbitrary<string> {
  return fc.constantFrom(...NODE_SUFFIXES);
}

/**
 * Arbitrary that generates a single valid node path segment (e.g., "21-parser.enabler").
 *
 * Note: the trailing "/" from NODE_SUFFIXES is stripped since node paths in
 * spx/EXCLUDE do not include trailing slashes per segment.
 */
export function arbitraryNodeSegment(): fc.Arbitrary<string> {
  return fc.tuple(fc.integer({ min: MIN_BSP, max: MAX_BSP }), arbitrarySlug(), arbitrarySuffix()).map(
    ([bsp, slug, suffix]) => `${bsp}-${slug}${suffix.replace(/\/$/, "")}`,
  );
}

/**
 * Arbitrary that generates a valid node path (1–3 segments deep).
 *
 * Examples: "21-parser.enabler", "32-api.outcome/21-auth.enabler"
 */
export function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSegment(), { minLength: 1, maxLength: 3 })
    .map((segments) => segments.join("/"));
}
