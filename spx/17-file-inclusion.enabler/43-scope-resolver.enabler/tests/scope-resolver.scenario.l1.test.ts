import { describe, expect, it } from "vitest";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion/pipeline";
import { DOMAIN_PATH_FILTER_LAYER } from "@/lib/file-inclusion/predicates/domain-path-filter";
import { GIT_TRACKING_LAYER } from "@/lib/file-inclusion/predicates/git-tracking";

import { fileContent, ignoredPattern } from "@testing/harnesses/file-inclusion/ignore-source";
import {
  resolverConfig,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("scope resolver — scenarios", () => {
  it("an explicit path that matches non-override layers appears in included with explicit-override first", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          explicit: [fixture.ignoredFilePath],
          domainPathFilter: { exclude: [fixture.ignoredFilePath] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const entry = result.included.find((e) => e.path === fixture.ignoredFilePath);
      expect(entry).toBeDefined();
      expect(entry!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
    });
  });

  it("a walk root excludes git-tracking and domain-path-filter matches with responsible layers", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const domainExcluded = result.excluded.find((e) => e.path === fixture.domainExcludedPath);
      expect(domainExcluded).toBeDefined();
      expect(domainExcluded!.decisionTrail.some((d) => d.layer === DOMAIN_PATH_FILTER_LAYER)).toBe(true);

      const gitExcluded = result.excluded.find((e) => e.path === fixture.ignoredFilePath);
      expect(gitExcluded).toBeDefined();
      expect(gitExcluded!.decisionTrail.some((d) => d.layer === GIT_TRACKING_LAYER)).toBe(true);

      const included = result.included.find((e) => e.path === fixture.trackedFilePath);
      expect(included).toBeDefined();
    });
  });

  it("explicit paths and a walk root are resolved independently", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const result = await resolveScope(
        env.productDir,
        {
          explicit: [fixture.ignoredFilePath],
          walkRoot: env.productDir,
          domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const explicitEntry = result.included.find((e) => e.path === fixture.ignoredFilePath);
      expect(explicitEntry).toBeDefined();
      expect(explicitEntry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);

      const domainExcluded = result.excluded.find((e) => e.path === fixture.domainExcludedPath);
      expect(domainExcluded).toBeDefined();

      const included = result.included.find((e) => e.path === fixture.trackedFilePath);
      expect(included).toBeDefined();
    });
  });

  it("constructs git-tracking state from override flags", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      const ignoreFile = ignoredPattern();
      const ignoreFileOnly = `override-${ignoredPattern()}`;
      await env.writeUntracked(ignoreFileOnly, fileContent());
      await env.writeUntracked(ignoreFile, `${ignoreFileOnly}\n`);

      const noIgnore = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: {
            noIgnore: true,
            noIgnoreVcs: false,
            ignoreFile: undefined,
          },
        },
        resolverConfig,
      );
      const noIgnoreVcs = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: {
            noIgnore: false,
            noIgnoreVcs: true,
            ignoreFile: undefined,
          },
        },
        resolverConfig,
      );
      const ignoreFileResult = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: {
            noIgnore: false,
            noIgnoreVcs: false,
            ignoreFile,
          },
        },
        resolverConfig,
      );

      expect(noIgnore.included.some((entry) => entry.path === fixture.ignoredFilePath)).toBe(true);
      expect(noIgnore.appliedOverrides).toEqual({
        noIgnore: true,
        noIgnoreVcs: false,
        ignoreFile: undefined,
      });
      expect(noIgnoreVcs.included.some((entry) => entry.path === fixture.ignoredFilePath)).toBe(true);
      expect(noIgnoreVcs.appliedOverrides).toEqual({
        noIgnore: false,
        noIgnoreVcs: true,
        ignoreFile: undefined,
      });
      expect(ignoreFileResult.excluded.some((entry) => entry.path === ignoreFileOnly)).toBe(true);
      expect(ignoreFileResult.appliedOverrides).toEqual({
        noIgnore: false,
        noIgnoreVcs: false,
        ignoreFile,
      });
    });
  });
});
