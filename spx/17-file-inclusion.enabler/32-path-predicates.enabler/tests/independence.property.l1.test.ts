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
  hiddenPrefixConfig,
  integrationConfig,
  makeIgnoreSourceConfig,
  PROPERTY_NUM_RUNS,
  spxPath,
} from "./support";

describe("predicate independence — properties", () => {
  it("artifact-directory decision is unaffected by interleaved calls to the hidden-prefix predicate", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const before = artifactDirectoryPredicate(path, artifactDirConfig);
        hiddenPrefixPredicate(path, hiddenPrefixConfig);
        const after = artifactDirectoryPredicate(path, artifactDirConfig);
        expect(before).toEqual(after);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("hidden-prefix decision is unaffected by interleaved calls to the artifact-directory predicate", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const before = hiddenPrefixPredicate(path, hiddenPrefixConfig);
        artifactDirectoryPredicate(path, artifactDirConfig);
        const after = hiddenPrefixPredicate(path, hiddenPrefixConfig);
        expect(before).toEqual(after);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source decision is unaffected by interleaved calls to artifact-directory and hidden-prefix predicates", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          const path = spxPath(segment, sub);
          const before = ignoreSourcePredicate(path, config);
          artifactDirectoryPredicate(path, artifactDirConfig);
          hiddenPrefixPredicate(path, hiddenPrefixConfig);
          const after = ignoreSourcePredicate(path, config);
          expect(before).toEqual(after);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("calling entries() on the ignore-source reader does not mutate it — ignore-source predicate results are stable across reader.entries() calls", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          const path = spxPath(segment, sub);
          const before = ignoreSourcePredicate(path, config);
          config.reader.entries();
          config.reader.entries();
          const after = ignoreSourcePredicate(path, config);
          expect(before).toEqual(after);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
