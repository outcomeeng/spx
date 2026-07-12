/**
 * Formatting validation generator.
 *
 * Owns variable path generation for the dprint formatting stage's co-located
 * evidence. The driver harness owns scenario routing and filesystem setup and
 * imports dprint protocol tokens from the production contract.
 */

import * as fc from "fast-check";

/**
 * Arbitrary explicit file-scope lists passed to `dprint check`.
 *
 * The argument builder treats file scope as opaque path strings, so the domain
 * is non-empty relative-path-shaped strings of varying length, owned here so no
 * property test hardcodes its own input values.
 */
export function arbitraryDprintFileArguments(): fc.Arbitrary<string[]> {
  const pathSegment = fc.string({ minLength: 1, maxLength: 12 }).filter((segment) => !segment.includes("\0"));
  const filePath = fc.array(pathSegment, { minLength: 1, maxLength: 4 }).map((segments) => segments.join("/"));
  return fc.array(filePath, { maxLength: 6 });
}
