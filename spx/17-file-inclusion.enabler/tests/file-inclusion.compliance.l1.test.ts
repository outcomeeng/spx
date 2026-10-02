import { describe, expect, it } from "vitest";

import type { PathFilterConfig } from "@/config/primitives/path-filter";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion";
import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { DOMAIN_PATH_FILTER_LAYER } from "@/lib/file-inclusion/predicates/domain-path-filter";
import { GIT_TRACKING_LAYER } from "@/lib/file-inclusion/predicates/git-tracking";
import type { IgnoreSourceOverrides } from "@/lib/file-inclusion/types";
import type { FilterLayerViolationFixture } from "@testing/harnesses/file-inclusion/filter-layer-violation";
import { writeFilterLayerViolationFixture } from "@testing/harnesses/file-inclusion/filter-layer-violation";
import { resolverConfig } from "@testing/harnesses/file-inclusion/scope-resolver";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

type ViolatingCase = {
  readonly pathField: keyof FilterLayerViolationFixture;
  readonly domainPathFilter?: (fixture: FilterLayerViolationFixture) => PathFilterConfig;
  readonly overrides?: (fixture: FilterLayerViolationFixture) => IgnoreSourceOverrides;
  /** The layer that drops the path from an automatic walk; absent when the path never enters the walk. */
  readonly droppingLayer?: string;
};

describe("NEVER: an explicit caller-supplied path is dropped, rewritten, or ignored by any filter layer", () => {
  // Each case is a caller-supplied path that one filter layer of the rule drops from an automatic walk:
  // every git ignore source, a caller ignore file, both domain-filter directions, and a submodule boundary.
  const violatingCases: readonly ViolatingCase[] = [
    { pathField: "ignoredFilePath", droppingLayer: GIT_TRACKING_LAYER },
    { pathField: "nestedIgnoredPath", droppingLayer: GIT_TRACKING_LAYER },
    { pathField: "infoExcludedPath", droppingLayer: GIT_TRACKING_LAYER },
    { pathField: "globalExcludedPath", droppingLayer: GIT_TRACKING_LAYER },
    {
      pathField: "ignoreFileMatchedPath",
      overrides: (f) => ({ ...DEFAULT_IGNORE_SOURCE_OVERRIDES, ignoreFile: f.ignoreFilePath }),
      droppingLayer: GIT_TRACKING_LAYER,
    },
    {
      pathField: "domainExcludedPath",
      domainPathFilter: (f) => ({ exclude: [f.domainExcludePrefix] }),
      droppingLayer: DOMAIN_PATH_FILTER_LAYER,
    },
    {
      pathField: "domainIncludeMissPath",
      domainPathFilter: (f) => ({ include: [f.domainIncludePrefix] }),
      droppingLayer: DOMAIN_PATH_FILTER_LAYER,
    },
    { pathField: "submoduleContentPath" },
  ];

  it.each(violatingCases)(
    "keeps the explicit $pathField that a filter layer drops from a walk",
    async (violatingCase) => {
      await withGitWorktreeEnv(async (env) => {
        const fixture = await writeFilterLayerViolationFixture(env);
        const path = fixture[violatingCase.pathField];
        const layerRequest = {
          walkRoot: env.productDir,
          domainPathFilter: violatingCase.domainPathFilter?.(fixture),
          overrides: violatingCase.overrides?.(fixture) ?? DEFAULT_IGNORE_SOURCE_OVERRIDES,
        };

        const walked = await resolveScope(env.productDir, layerRequest, resolverConfig);
        const explicit = await resolveScope(env.productDir, { ...layerRequest, explicit: [path] }, resolverConfig);

        expect(
          walked.included.map((entry) => entry.path),
          `the filter layer must drop "${path}" from the automatic walk`,
        ).not.toContain(path);
        if (violatingCase.droppingLayer !== undefined) {
          const walkedExclusion = walked.excluded.find((entry) => entry.path === path);
          expect(walkedExclusion?.decisionTrail.map((decision) => decision.layer)).toContain(
            violatingCase.droppingLayer,
          );
        }

        const explicitEntries = explicit.included.filter((entry) => entry.path === path);
        expect(explicitEntries, `"${path}" must reach the included set unrewritten, once`).toHaveLength(1);
        expect(explicitEntries[0]?.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
        expect(explicit.excluded.map((entry) => entry.path)).not.toContain(path);
      });
    },
  );
});
