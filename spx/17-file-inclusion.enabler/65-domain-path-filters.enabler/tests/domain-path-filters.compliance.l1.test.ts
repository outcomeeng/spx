import { describe, expect, it } from "vitest";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion/pipeline";
import {
  DOMAIN_PATH_FILTER_DETAIL_PREFIX,
  DOMAIN_PATH_FILTER_LAYER,
} from "@/lib/file-inclusion/predicates/domain-path-filter";
import { GIT_TRACKING_LAYER } from "@/lib/file-inclusion/predicates/git-tracking";
import {
  resolverConfig,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("domain path filters — compliance", () => {
  it("records include and exclude matches in the scope decision trail", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: {
            exclude: [fixture.domainExcludePrefix],
            include: [fixture.domainIncludePrefix],
          },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const excluded = result.excluded.find((e) => e.path === fixture.domainExcludedPath);
      expect(excluded).toBeDefined();
      expect(excluded!.decisionTrail).toContainEqual({
        matched: true,
        layer: DOMAIN_PATH_FILTER_LAYER,
        detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${fixture.domainExcludePrefix}`,
      });

      const includeMiss = result.excluded.find((e) => e.path === fixture.domainIncludeMissPath);
      expect(includeMiss).toBeDefined();
      expect(includeMiss!.decisionTrail).toContainEqual({
        matched: true,
        layer: DOMAIN_PATH_FILTER_LAYER,
        detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.INCLUDE}${fixture.domainIncludePrefix}`,
      });
    });
  });

  it("explicit caller-supplied paths bypass domain path filters", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          explicit: [fixture.domainIncludeMissPath],
          domainPathFilter: { include: [fixture.domainIncludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const explicit = result.included.find((e) => e.path === fixture.domainIncludeMissPath);
      expect(explicit).toBeDefined();
      expect(explicit!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
    });
  });

  it("a domain path filter narrows only the request that carries it", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const unfiltered = await resolveScope(
        env.productDir,
        { walkRoot: env.productDir, overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES },
        resolverConfig,
      );
      const filtered = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      expect(unfiltered.included.some((e) => e.path === fixture.domainExcludedPath)).toBe(true);
      expect(filtered.excluded.some((e) => e.path === fixture.domainExcludedPath)).toBe(true);
    });
  });

  it("a domain include filter does not expand scope beyond git-tracking", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { include: [fixture.ignoredFilePath] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const ignored = result.excluded.find((e) => e.path === fixture.ignoredFilePath);
      expect(ignored).toBeDefined();
      expect(ignored!.decisionTrail.some((decision) => decision.layer === GIT_TRACKING_LAYER)).toBe(true);
    });
  });
});
