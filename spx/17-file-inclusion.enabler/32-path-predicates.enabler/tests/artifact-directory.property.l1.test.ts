import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { artifactDirectoryPredicate } from "@/lib/file-inclusion/predicates/artifact-directory";

import { artifactDirs, PROPERTY_NUM_RUNS } from "./support";

describe("artifact-directory predicate — properties", () => {
  it("any path containing a configured artifact-directory segment reports matched: true regardless of the segment's position in the path", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...artifactDirs),
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
            !artifactDirs.includes(s as (typeof artifactDirs)[number])
          ),
          {
            maxLength: 4,
          },
        ),
        fc.integer({ min: 0, max: 10 }),
        (artifactDir, otherSegments, insertIndex) => {
          const position = insertIndex % (otherSegments.length + 1);
          const segments = [
            ...otherSegments.slice(0, position),
            artifactDir,
            ...otherSegments.slice(position),
          ];
          const path = segments.join("/");
          const config = { artifactDirectories: [...artifactDirs] };
          const result = artifactDirectoryPredicate(path, config);
          expect(result.matched, `path="${path}"`).toBe(true);
          expect(result.detail, `detail for path="${path}"`).toBe(artifactDir);
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("any path containing no configured artifact-directory segment reports matched: false", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(
            (s) => !artifactDirs.includes(s as (typeof artifactDirs)[number]),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (segments) => {
          const path = segments.join("/");
          const config = { artifactDirectories: [...artifactDirs] };
          const result = artifactDirectoryPredicate(path, config);
          expect(result.matched, `path="${path}"`).toBe(false);
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("adding non-artifact segments to a matching path preserves the match — result depends on segment set, not path length", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...artifactDirs),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
          !artifactDirs.includes(s as (typeof artifactDirs)[number])
        ),
        (artifactDir, extra) => {
          const basePath = `${artifactDir}/${extra}`;
          const extendedPath = `prefix/${basePath}/suffix`;
          const config = { artifactDirectories: [...artifactDirs] };
          expect(artifactDirectoryPredicate(basePath, config).matched).toBe(true);
          expect(artifactDirectoryPredicate(extendedPath, config).matched).toBe(true);
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("removing the only artifact-directory segment from a path makes it report matched: false", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...artifactDirs),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
          !artifactDirs.includes(s as (typeof artifactDirs)[number])
        ),
        (artifactDir, suffix) => {
          const pathWithArtifact = `${artifactDir}/${suffix}`;
          const pathWithoutArtifact = `module/${suffix}`;
          const config = { artifactDirectories: [...artifactDirs] };
          expect(artifactDirectoryPredicate(pathWithArtifact, config).matched).toBe(true);
          expect(artifactDirectoryPredicate(pathWithoutArtifact, config).matched).toBe(false);
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
