import { describe, expect, it } from "vitest";

import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { resolveConfig } from "@/config";
import {
  EXPLICIT_OVERRIDE_LAYER,
  FILE_INCLUSION_CONFIG_FIELDS,
  FILE_INCLUSION_SECTION,
  fileInclusionConfigDescriptor,
  resolveScope,
  TOOL_NAMES,
  toToolArguments,
} from "@/lib/file-inclusion";
import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { DOMAIN_PATH_FILTER_LAYER } from "@/lib/file-inclusion/predicates/domain-path-filter";
import { GIT_TRACKING_LAYER } from "@/lib/file-inclusion/predicates/git-tracking";
import { CONFIG_GENERATOR, sampleConfigValue } from "@testing/generators/config/config";

import { fileContent, ignoredPattern, trackedFilePath } from "@testing/harnesses/file-inclusion/ignore-source";
import { pathPrefix } from "@testing/harnesses/file-inclusion/path-predicates";
import {
  distinctPrefixedTrackedPaths,
  resolverConfig,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { runEslintOverProduct, writeEslintProbeConfig } from "@testing/harnesses/file-inclusion/tool-invocation";

describe("file-inclusion service — scenarios", () => {
  it("explicit paths are included with explicit-override as first decision trail entry", async () => {
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
      expect(entry, `scope.included missing entry for "${fixture.ignoredFilePath}"`).toBeDefined();
      expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
    });
  });

  it("walked scope excludes domain-filter and git-tracking entries with responsible layers", async () => {
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
      expect(domainExcluded, `scope.excluded missing entry for "${fixture.domainExcludedPath}"`).toBeDefined();
      expect(domainExcluded!.decisionTrail.some((d) => d.layer === DOMAIN_PATH_FILTER_LAYER)).toBe(true);

      const gitExcluded = result.excluded.find((e) => e.path === fixture.ignoredFilePath);
      expect(gitExcluded, `scope.excluded missing entry for "${fixture.ignoredFilePath}"`).toBeDefined();
      expect(gitExcluded!.decisionTrail.some((d) => d.layer === GIT_TRACKING_LAYER)).toBe(true);

      const included = result.included.find((e) => e.path === fixture.trackedFilePath);
      expect(included, `scope.included missing entry for "${fixture.trackedFilePath}"`).toBeDefined();
    });
  });

  it("walked scope excludes all git ignore sources, submodule contents, and domain include misses", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      const [nestedDirectory, submodule] = distinctPrefixedTrackedPaths(2).map((path) => pathPrefix(path));
      const nestedPattern = ignoredPattern();
      const nestedIgnored = `${nestedDirectory}/${nestedPattern}`;
      const infoIgnored = ignoredPattern();
      const globalIgnored = ignoredPattern();
      const submoduleContent = trackedFilePath();
      await env.writeGitignore(nestedDirectory, nestedPattern);
      await env.writeUntracked(nestedIgnored, fileContent());
      await env.writeInfoExclude(`${infoIgnored}\n`);
      await env.writeUntracked(infoIgnored, fileContent());
      await env.configureGlobalExcludes(`${globalIgnored}\n`);
      await env.writeUntracked(globalIgnored, fileContent());
      await env.addSubmodule(submodule);
      await env.writeUntracked(`${submodule}/${submoduleContent}`, fileContent());

      const gitResult = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );
      const includeResult = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { include: [fixture.domainIncludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      for (const gitExcludedPath of [nestedIgnored, infoIgnored, globalIgnored]) {
        const entry = gitResult.excluded.find((candidate) => candidate.path === gitExcludedPath);
        expect(entry).toBeDefined();
        expect(entry!.decisionTrail.some((decision) => decision.layer === GIT_TRACKING_LAYER)).toBe(true);
      }

      const submoduleInnerPath = `${submodule}/${submoduleContent}`;
      expect(gitResult.included.some((entry) => entry.path === submoduleInnerPath)).toBe(false);
      expect(gitResult.excluded.some((entry) => entry.path === submoduleInnerPath)).toBe(false);

      const includeMiss = includeResult.excluded.find((entry) => entry.path === fixture.domainIncludeMissPath);
      expect(includeMiss).toBeDefined();
      expect(includeMiss!.decisionTrail.some((decision) => decision.layer === DOMAIN_PATH_FILTER_LAYER)).toBe(true);
    });
  });

  it("walked scope includes every git ignore source when no-ignore is set", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [nestedDirectory] = distinctPrefixedTrackedPaths(1).map((path) => pathPrefix(path));
      const nestedPattern = ignoredPattern();
      const nestedIgnored = `${nestedDirectory}/${nestedPattern}`;
      const infoIgnored = ignoredPattern();
      const globalIgnored = ignoredPattern();
      await env.writeGitignore(nestedDirectory, nestedPattern);
      await env.writeUntracked(nestedIgnored, fileContent());
      await env.writeInfoExclude(`${infoIgnored}\n`);
      await env.writeUntracked(infoIgnored, fileContent());
      await env.configureGlobalExcludes(`${globalIgnored}\n`);
      await env.writeUntracked(globalIgnored, fileContent());

      const result = await resolveScope(
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

      expect(result.appliedOverrides.noIgnore).toBe(true);
      for (const includedPath of [nestedIgnored, infoIgnored, globalIgnored]) {
        const entry = result.included.find((candidate) => candidate.path === includedPath);
        expect(entry).toBeDefined();
        expect(entry!.decisionTrail.some((decision) => decision.layer === GIT_TRACKING_LAYER)).toBe(false);
      }
    });
  });

  it("the eslint invocation ignores exactly the resolved excluded set and references no other paths", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      await writeEslintProbeConfig(env.productDir);

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );
      const args = toToolArguments(result, TOOL_NAMES.ESLINT, fileInclusionConfigDescriptor.defaults.tools);
      const eslint = await runEslintOverProduct(env.productDir, args);

      const includedPaths = result.included.map((entry) => entry.path);
      const excludedPaths = result.excluded.map((entry) => entry.path);
      expect(excludedPaths, "the resolved scope must exclude at least one walked path").not.toHaveLength(0);
      expect(new Set(eslint.lintedPaths), `eslint stderr: ${eslint.stderr}`).toEqual(new Set(includedPaths));

      const excludedArgs = args.filter((arg) => excludedPaths.includes(arg));
      const nonExcludedArgs = new Set(args.filter((arg) => !excludedPaths.includes(arg)));
      expect(nonExcludedArgs.size, `arguments other than excluded paths: ${[...nonExcludedArgs].join(" ")}`).toBe(1);
      expect(excludedArgs).toHaveLength(excludedPaths.length);
      expect(new Set(excludedArgs)).toEqual(new Set(excludedPaths));
      for (const includedPath of includedPaths) {
        expect(args).not.toContain(includedPath);
      }
    });
  });

  it("file-inclusion scope and tool values resolve through the config descriptor", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[FILE_INCLUSION_SECTION]).toEqual(generated.expected);
      }
    });
  });

  it("file-inclusion tool overrides default missing adapter fields from the registered tool", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionPartialToolOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[FILE_INCLUSION_SECTION]).toEqual(generated.expected);
      }
    });
  });

  it("file-inclusion rejects unknown tool override names", async () => {
    const generated = sampleConfigValue(CONFIG_GENERATOR.fileInclusionUnknownToolOverride());

    await withTestEnv(generated.config, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(generated.toolName);
      }
    });
  });

  it("file-inclusion rejects an explicit null value for the scope section", async () => {
    await withTestEnv({ [FILE_INCLUSION_SECTION]: { [FILE_INCLUSION_CONFIG_FIELDS.SCOPE]: null } }, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.SCOPE}`);
      }
    });
  });

  it("file-inclusion rejects an explicit null value for the tools section", async () => {
    await withTestEnv({ [FILE_INCLUSION_SECTION]: { [FILE_INCLUSION_CONFIG_FIELDS.TOOLS]: null } }, async (env) => {
      const result = await resolveConfig(env.productDir, [fileInclusionConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${FILE_INCLUSION_SECTION}.${FILE_INCLUSION_CONFIG_FIELDS.TOOLS}`);
      }
    });
  });
});
