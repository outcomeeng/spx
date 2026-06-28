import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { LAYER_SEQUENCE } from "@/lib/file-inclusion/layer-sequence";
import {
  EXPLICIT_OVERRIDE_LAYER,
  GIT_INTERNAL_DIRECTORY,
  resolveScope,
  runPipeline,
} from "@/lib/file-inclusion/pipeline";
import type { LayerEntry } from "@/lib/file-inclusion/pipeline";
import { GIT_TRACKING_LAYER } from "@/lib/file-inclusion/predicates/git-tracking";
import type { LayerDecision } from "@/lib/file-inclusion/types";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { fileContent, trackedFilePath } from "@testing/harnesses/file-inclusion/ignore-source";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";

import {
  makeResolverState,
  resolverConfig,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const linkedWorktreeTempPrefix = "spx-linked-scope-resolver-";

async function writeUnderDirectory(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

describe("scope resolver — compliance", () => {
  it("LAYER_SEQUENCE is a non-empty ordered tuple whose entries expose predicate and extractState", () => {
    expect(Array.isArray(LAYER_SEQUENCE)).toBe(true);
    expect(LAYER_SEQUENCE.length).toBeGreaterThan(0);
    for (const entry of LAYER_SEQUENCE) {
      expect(entry.predicate).toBeDefined();
      expect(entry.extractState).toBeDefined();
    }
  });

  it("LAYER_SEQUENCE layer names are non-empty strings", () => {
    const state = makeResolverState();
    const layerNames = LAYER_SEQUENCE.map((entry) => {
      const sample = entry.predicate("", entry.extractState(state));
      return sample.layer;
    });
    expect(layerNames.length).toBeGreaterThan(0);
    for (const name of layerNames) {
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("explicit-override short-circuits at pipeline level", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      const explicitPaths = [
        fixture.ignoredFilePath,
        fixture.domainExcludedPath,
        fixture.domainIncludeMissPath,
      ];
      const result = await resolveScope(
        env.productDir,
        {
          explicit: explicitPaths,
          domainPathFilter: {
            exclude: [fixture.domainExcludePrefix],
            include: [fixture.domainIncludePrefix],
          },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      for (const explicitPath of explicitPaths) {
        const entry = result.included.find((e) => e.path === explicitPath);
        expect(entry, `scope.resolver.compliance absent from scope.included: ${explicitPath}`).toBeDefined();
        expect(entry!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
      }
    });
  });

  it("explicit-override does not evaluate non-override layer predicates", async () => {
    await withGitWorktreeEnv(async (env) => {
      const explicitPath = trackedFilePath();
      const throwingLayer: LayerEntry = {
        predicate: (): LayerDecision => {
          throw new Error("non-override layer predicate evaluated for explicit path");
        },
        extractState: () => ({}),
      };

      const result = await runPipeline(
        [throwingLayer],
        env.productDir,
        { explicit: [explicitPath], overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES },
        resolverConfig,
        {
          isInIncludedSet: () => false,
          hasIncludedDescendant: () => false,
          appliedOverrides: () => DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
      );

      expect(result.included).toEqual([
        {
          path: explicitPath,
          decisionTrail: [{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }],
        },
      ]);
    });
  });

  it("explicit directory descendants bypass git-based directory pruning", async () => {
    await withGitWorktreeEnv(async (env) => {
      const explicitDirectory = trackedFilePath();
      const explicitChild = `${explicitDirectory}/${trackedFilePath()}`;
      await env.writeGitignore(".", `${explicitDirectory}/\n`);
      await env.writeUntracked(explicitChild, fileContent());

      const result = await resolveScope(
        env.productDir,
        { explicit: [explicitDirectory], overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES },
        resolverConfig,
      );

      const explicitDirectoryEntry = result.included.find((entry) => entry.path === explicitDirectory);
      const explicitChildEntry = result.included.find((entry) => entry.path === explicitChild);
      expect(explicitDirectoryEntry).toBeDefined();
      expect(explicitChildEntry).toBeDefined();
      expect(explicitDirectoryEntry!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
      expect(explicitChildEntry!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
    });
  });

  it("explicit directory descendants include submodule contents", async () => {
    await withGitWorktreeEnv(async (env) => {
      const explicitDirectory = trackedFilePath();
      const submodule = `${explicitDirectory}/${trackedFilePath()}`;
      const submoduleChild = `${submodule}/${trackedFilePath()}`;
      await env.addSubmodule(submodule);
      await env.writeUntracked(submoduleChild, fileContent());

      const result = await resolveScope(
        env.productDir,
        { explicit: [explicitDirectory], overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES },
        resolverConfig,
      );

      const explicitChildEntry = result.included.find((entry) => entry.path === submoduleChild);
      expect(explicitChildEntry).toBeDefined();
      expect(explicitChildEntry!.decisionTrail).toEqual([{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }]);
    });
  });

  it("ScopeResult excluded entries always carry per-path decision trails", async () => {
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
      for (const excluded of result.excluded) {
        expect(
          excluded.decisionTrail.length,
          `excluded path "${excluded.path}" must have a non-empty decision trail`,
        ).toBeGreaterThan(0);
      }
    });
  });

  it("ignored directory descendants still reach excluded classification", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignoredDirectory = trackedFilePath();
      const ignoredChild = `${ignoredDirectory}/${trackedFilePath()}`;
      await env.writeGitignore(".", `${ignoredDirectory}/\n`);
      await env.writeUntracked(ignoredChild, fileContent());

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      const excluded = result.excluded.find((entry) => entry.path === ignoredChild);
      expect(excluded).toBeDefined();
      expect(excluded!.decisionTrail.some((decision) => decision.layer === GIT_TRACKING_LAYER)).toBe(true);
    });
  });

  it("ScopeResult caller-supplied explicit paths always carry an explicit-override trail entry", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      const explicitPaths = [
        fixture.ignoredFilePath,
        fixture.domainExcludedPath,
        fixture.domainIncludeMissPath,
      ];
      const result = await resolveScope(
        env.productDir,
        {
          explicit: explicitPaths,
          walkRoot: env.productDir,
          domainPathFilter: {
            exclude: [fixture.domainExcludePrefix],
            include: [fixture.domainIncludePrefix],
          },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );
      for (const path of explicitPaths) {
        const entry = result.included.find((e) => e.path === path);
        expect(entry, `explicit path "${path}" must be in included`).toBeDefined();
        expect(
          entry!.decisionTrail.some((d) => d.layer === EXPLICIT_OVERRIDE_LAYER),
          `explicit path "${path}" must have explicit-override in trail`,
        ).toBe(true);
      }
    });
  });

  it("walked scope never includes the linked-worktree .git admin file", async () => {
    await withGitWorktreeEnv(async (env) => {
      const tracked = trackedFilePath();
      await env.writeTracked(tracked, fileContent());
      await env.commit(sampleGitWorktreeTestValue(arbitraryPathSegment()));
      await withTempDir(linkedWorktreeTempPrefix, async (linkedWorktreeDir) => {
        await env.runGit([
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          sampleGitWorktreeTestValue(arbitraryPathSegment()),
          linkedWorktreeDir,
        ]);
        await writeUnderDirectory(linkedWorktreeDir, tracked, fileContent());

        const result = await resolveScope(
          linkedWorktreeDir,
          {
            walkRoot: linkedWorktreeDir,
            overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
          },
          resolverConfig,
        );

        expect(result.included.some((entry) => entry.path === GIT_INTERNAL_DIRECTORY)).toBe(false);
        expect(result.excluded.some((entry) => entry.path === GIT_INTERNAL_DIRECTORY)).toBe(false);
      });
    });
  });

  it("explicit directory expansion includes ordinary tracked files named .git", async () => {
    await withGitWorktreeEnv(async (env) => {
      const normalDirectory = sampleGitWorktreeTestValue(arbitraryPathSegment());
      const trackedGitFile = `${normalDirectory}/${GIT_INTERNAL_DIRECTORY}`;
      await env.writeTracked(trackedGitFile, fileContent());

      const result = await resolveScope(
        env.productDir,
        {
          explicit: [normalDirectory],
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      expect(result.included.some((entry) => entry.path === trackedGitFile)).toBe(true);
      expect(result.excluded.some((entry) => entry.path === trackedGitFile)).toBe(false);
    });
  });

  it("automatic walking descends through directories containing ordinary tracked files named .git", async () => {
    await withGitWorktreeEnv(async (env) => {
      const normalDirectory = sampleGitWorktreeTestValue(arbitraryPathSegment());
      const trackedGitFile = `${normalDirectory}/${GIT_INTERNAL_DIRECTORY}`;
      const trackedChild = `${normalDirectory}/${trackedFilePath()}`;
      await env.writeTracked(trackedGitFile, fileContent());
      await env.writeTracked(trackedChild, fileContent());

      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );

      expect(result.included.some((entry) => entry.path === trackedChild)).toBe(true);
      expect(result.excluded.some((entry) => entry.path === trackedChild)).toBe(false);
    });
  });
});
