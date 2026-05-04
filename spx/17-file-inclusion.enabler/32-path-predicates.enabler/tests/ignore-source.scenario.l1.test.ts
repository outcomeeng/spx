import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ignoreSourcePredicate } from "@/lib/file-inclusion/predicates/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbNodeSegment,
  arbSubpath,
  integrationConfig,
  makeIgnoreSourceConfig,
  PROPERTY_NUM_RUNS,
  spxPath,
} from "./support";

describe("ignore-source predicate — scenarios", () => {
  it("a path under a reader-reported node directory reports matched: true with the matched entry segment as the detail", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          const result = ignoreSourcePredicate(spxPath(segment, sub), config);
          expect(result.matched).toBe(true);
          expect(result.detail).toBe(segment);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("a path outside every reader-reported node directory reports matched: false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        arbSubpath,
        async ([listed, unlisted], sub) => {
          await withTestEnv(integrationConfig, async (env) => {
            const config = await makeIgnoreSourceConfig(env, [listed]);

            const result = ignoreSourcePredicate(spxPath(unlisted, sub), config);
            expect(result.matched).toBe(false);
            expect(result.detail).toBeUndefined();
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("a path under the node directory itself (no trailing path component) reports matched: false — prefix requires trailing separator", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, async (segment) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          const result = ignoreSourcePredicate(spxPath(segment), config);
          expect(result.matched).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("an empty reader (no entries) reports matched: false for all paths", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, []);

          const result = ignoreSourcePredicate(spxPath(segment, sub), config);
          expect(result.matched).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("every ignore-source result carries a layer string identifying the predicate", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        arbSubpath,
        async ([listed, unlisted], sub) => {
          await withTestEnv(integrationConfig, async (env) => {
            const config = await makeIgnoreSourceConfig(env, [listed]);

            const matched = ignoreSourcePredicate(spxPath(listed, sub), config);
            const unmatched = ignoreSourcePredicate(spxPath(unlisted, sub), config);
            expect(matched.layer.length).toBeGreaterThan(0);
            expect(matched.layer).toBe(unmatched.layer);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
