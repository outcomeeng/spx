import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { artifactDirectoryPredicate } from "@/lib/file-inclusion/predicates/artifact-directory";
import { hiddenPrefixPredicate } from "@/lib/file-inclusion/predicates/hidden-prefix";
import { ignoreSourcePredicate } from "@/lib/file-inclusion/predicates/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbNodeSegment,
  arbSubpath,
  artifactDirConfig,
  artifactDirs,
  hiddenPrefix,
  hiddenPrefixConfig,
  integrationConfig,
  makeIgnoreSourceConfig,
  PROPERTY_NUM_RUNS,
  spxPath,
} from "./support";

describe("predicate purity — properties", () => {
  it("artifact-directory predicate produces equal LayerDecision on repeated calls with equal (path, config)", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.constantFrom(...artifactDirs), { maxLength: 4 }), (path, dirs) => {
        const config = { artifactDirectories: dirs };
        expect(artifactDirectoryPredicate(path, config)).toEqual(artifactDirectoryPredicate(path, config));
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("hidden-prefix predicate produces equal LayerDecision on repeated calls with equal (path, config)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1, maxLength: 3 }), (path, prefix) => {
        const config = { hiddenPrefix: prefix };
        expect(hiddenPrefixPredicate(path, config)).toEqual(hiddenPrefixPredicate(path, config));
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("hidden-prefix predicate with the canonical dot prefix produces equal results on repeated calls", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        expect(hiddenPrefixPredicate(path, hiddenPrefixConfig)).toEqual(
          hiddenPrefixPredicate(path, hiddenPrefixConfig),
        );
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("artifact-directory predicate with the canonical config produces equal results on repeated calls", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        expect(artifactDirectoryPredicate(path, artifactDirConfig)).toEqual(
          artifactDirectoryPredicate(path, artifactDirConfig),
        );
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source predicate produces equal LayerDecision on repeated calls with the same reader and path", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, fc.string(), async (segment, sub, randomPath) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          const matchingPath = spxPath(segment, sub);
          expect(ignoreSourcePredicate(matchingPath, config)).toEqual(ignoreSourcePredicate(matchingPath, config));
          expect(ignoreSourcePredicate(randomPath, config)).toEqual(ignoreSourcePredicate(randomPath, config));
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("hidden-prefix layer name is a non-empty string consistent across all paths regardless of match outcome", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (p1, p2) => {
        const r1 = hiddenPrefixPredicate(p1, hiddenPrefixConfig);
        const r2 = hiddenPrefixPredicate(p2, hiddenPrefixConfig);
        expect(r1.layer.length).toBeGreaterThan(0);
        expect(r1.layer).toBe(r2.layer);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("hidden-prefix predicate uses only the basename: a path whose last segment starts with the hidden prefix always matches regardless of other segments", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }).filter((s) => !s.includes("/")), {
          minLength: 0,
          maxLength: 4,
        }),
        fc.string({ minLength: 1 }).filter((s) => !s.includes("/")),
        (prefixSegments, suffix) => {
          const hiddenBasename = `${hiddenPrefix}${suffix}`;
          const path = [...prefixSegments, hiddenBasename].join("/");
          expect(hiddenPrefixPredicate(path, hiddenPrefixConfig).matched).toBe(true);
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
