import fc from "fast-check";

import { comparePathEntries, FIXTURE_ROOT } from "@/lib/sonarqube-cloud/exclusions";

const PATH_SEGMENT = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
const FILE_EXTENSION = fc.constantFrom("ts", "py", "json", "md", "xml", "txt", "fixture");

/**
 * A tracked path under the fixture root, e.g. `testing/fixtures/projects/a/src/main.ts`.
 * Depth and extension vary so parsing and comparison are exercised across real shapes.
 */
export function arbitraryFixturePath(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.array(PATH_SEGMENT, { minLength: 1, maxLength: 4 }), PATH_SEGMENT, FILE_EXTENSION)
    .map(([dirs, base, ext]) => [FIXTURE_ROOT, ...dirs, `${base}.${ext}`].join("/"));
}

/**
 * A non-empty set of distinct fixture paths — the shape of `git ls-files testing/fixtures/`.
 */
export function arbitraryFixturePathSet(): fc.Arbitrary<string[]> {
  return fc
    .uniqueArray(arbitraryFixturePath(), { minLength: 1, maxLength: 12 })
    .map((paths) => [...paths].sort(comparePathEntries));
}

/**
 * A tracked path outside the fixture root, e.g. `src/lib/a/main.ts`. Used to prove that
 * exclusion entries that are not fixture inputs are never reported as drift.
 */
export function arbitraryNonFixturePath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom("src", "scripts", "docs"),
      fc.array(PATH_SEGMENT, { minLength: 1, maxLength: 3 }),
      PATH_SEGMENT,
      FILE_EXTENSION,
    )
    .map(([top, dirs, base, ext]) => [top, ...dirs, `${base}.${ext}`].join("/"));
}
