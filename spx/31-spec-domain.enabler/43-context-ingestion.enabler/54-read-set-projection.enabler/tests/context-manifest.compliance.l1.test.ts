import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_CONTEXT_READ_ROLE_ORDER,
  SPEC_TREE_GRAMMAR,
  type SpecContextManifest,
} from "@/lib/spec-tree";
import {
  divergentOrderSlugPair,
  freeSiblingOrder,
  markdownFixtureBody,
  rootedSpecPath,
  siblingDirectoryName,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  specFilePath,
} from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextListJson,
  contextListManifest,
  listedPaths,
  listedPathsForRole,
  parseContextManifest,
  readPaths,
  readPathsForRole,
  specTreeKindsConfig,
  trackSpecTreeInGit,
  withOutsideProductDir,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context manifest read set", () => {
  it("includes coordination notes from the product root, ancestors, and the target in walk order", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.COORDINATION)).toEqual([
        paths.rootPlanPath,
        paths.rootIssuesPath,
        paths.ancestorPlanPath,
        paths.ancestorIssuesPath,
        paths.targetIssuesPath,
      ]);
    });
  });

  it("lists runtime guides along the target path with no read obligation", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.GUIDE)).toEqual([
        ...paths.rootGuidePaths,
        paths.ancestorGuidePath,
      ]);
      for (const guidePath of [...paths.rootGuidePaths, paths.ancestorGuidePath]) {
        expect(readPaths(manifest)).not.toContain(guidePath);
      }
    });
  });

  it("reads the lifecycle overlay and lists every other overlay", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY)).toEqual([
        paths.lifecycleOverlayPath,
      ]);
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.OVERLAY)).toContain(paths.listedOverlayPath);
      expect(readPaths(manifest)).not.toContain(paths.listedOverlayPath);
      expect(listedPaths(manifest)).not.toContain(paths.lifecycleOverlayPath);
    });
  });

  it("orders listed overlays by code units where locale collation disagrees", async () => {
    await withRichContextEnv(async (env, paths) => {
      const overlayDirectory = rootedSpecPath(SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME);
      const pair = divergentOrderSlugPair();
      const codeUnitFirstOverlayPath =
        `${overlayDirectory}/${pair.codeUnitFirst}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`;
      const localeFirstOverlayPath =
        `${overlayDirectory}/${pair.localeFirst}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`;
      await env.writeRaw(codeUnitFirstOverlayPath, markdownFixtureBody(pair.codeUnitFirst));
      await env.writeRaw(localeFirstOverlayPath, markdownFixtureBody(pair.localeFirst));

      const overlayPairIn = (manifest: SpecContextManifest): readonly string[] =>
        listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.OVERLAY)
          .filter((path) => path === codeUnitFirstOverlayPath || path === localeFirstOverlayPath);

      const fallbackManifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(overlayPairIn(fallbackManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);

      // The tracked-paths branch is the one a real git worktree takes; it sorts
      // through the same comparator at a different call site.
      await trackSpecTreeInGit(env);
      const trackedManifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(overlayPairIn(trackedManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);
    });
  });

  it("orders sibling groups by code units where locale collation disagrees", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = env.fixture;
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const { codeUnitFirst: codeUnitFirstSlug, localeFirst: localeFirstSlug } = divergentOrderSlugPair();

      const lowerOrder = freeSiblingOrder(fixture);
      const targetOrder = lowerOrder + 1;
      const higherOrder = targetOrder + 1;
      const targetDirectory = siblingDirectoryName(fixture, targetOrder, slug);
      const pairDirectories = (order: number): readonly [string, string] => [
        siblingDirectoryName(fixture, order, codeUnitFirstSlug),
        siblingDirectoryName(fixture, order, localeFirstSlug),
      ];
      const [lowerCodeUnitFirst, lowerLocaleFirst] = pairDirectories(lowerOrder);
      const [sameCodeUnitFirst, sameLocaleFirst] = pairDirectories(targetOrder);
      const [higherCodeUnitFirst, higherLocaleFirst] = pairDirectories(higherOrder);

      await env.writeRaw(specFilePath(targetDirectory, slug), markdownFixtureBody(slug));
      await env.writeRaw(specFilePath(lowerCodeUnitFirst, codeUnitFirstSlug), markdownFixtureBody(codeUnitFirstSlug));
      await env.writeRaw(specFilePath(lowerLocaleFirst, localeFirstSlug), markdownFixtureBody(localeFirstSlug));
      await env.writeRaw(specFilePath(sameCodeUnitFirst, codeUnitFirstSlug), markdownFixtureBody(codeUnitFirstSlug));
      await env.writeRaw(specFilePath(sameLocaleFirst, localeFirstSlug), markdownFixtureBody(localeFirstSlug));
      await env.writeRaw(specFilePath(higherCodeUnitFirst, codeUnitFirstSlug), markdownFixtureBody(codeUnitFirstSlug));
      await env.writeRaw(specFilePath(higherLocaleFirst, localeFirstSlug), markdownFixtureBody(localeFirstSlug));

      const manifest = await contextListManifest({ targets: [targetDirectory], cwd: env.productDir });

      const lowerPair = readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING)
        .filter((path) =>
          path.startsWith(`${rootedSpecPath(lowerCodeUnitFirst)}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`)
          || path.startsWith(`${rootedSpecPath(lowerLocaleFirst)}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`)
        );
      expect(lowerPair).toStrictEqual([
        specFilePath(lowerCodeUnitFirst, codeUnitFirstSlug),
        specFilePath(lowerLocaleFirst, localeFirstSlug),
      ]);

      expect(
        listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING)
          .filter((path) => path === rootedSpecPath(sameCodeUnitFirst) || path === rootedSpecPath(sameLocaleFirst)),
      ).toStrictEqual([rootedSpecPath(sameCodeUnitFirst), rootedSpecPath(sameLocaleFirst)]);
      expect(
        listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING)
          .filter((path) => path === rootedSpecPath(higherCodeUnitFirst) || path === rootedSpecPath(higherLocaleFirst)),
      ).toStrictEqual([rootedSpecPath(higherCodeUnitFirst), rootedSpecPath(higherLocaleFirst)]);
    });
  });

  it("orders read entries by the declared role group order", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const groupIndexes = manifest.read.map((document) =>
        Math.min(...document.roles.map((binding) => SPEC_CONTEXT_READ_ROLE_ORDER.indexOf(binding.role)))
      );
      for (const groupIndex of groupIndexes) {
        expect(groupIndex).toBeGreaterThanOrEqual(0);
      }
      for (let position = 1; position < groupIndexes.length; position += 1) {
        expect(groupIndexes[position]).toBeGreaterThanOrEqual(groupIndexes[position - 1]);
      }
      const uniquePaths = readPaths(manifest);
      expect(new Set(uniquePaths).size).toBe(uniquePaths.length);
    });
  });

  it("binds no entry for a symbolic link whose canonical target escapes the product directory", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      await withOutsideProductDir(async (outsideParent) => {
        const outsideSecretPath = join(outsideParent, SPEC_CONTEXT_ESCAPE_TARGET_FILENAME);
        // The marker carries no newline or JSON-escapable character, so it
        // appears verbatim inside a JSON-encoded string — a leak is
        // observable in the raw output regardless of JSON string escaping.
        const secretMarker = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        await writeFile(outsideSecretPath, markdownFixtureBody(secretMarker));
        const escapingGuidePath = SPEC_TREE_GRAMMAR.GUIDE_FILES[1];
        await symlink(outsideSecretPath, join(env.productDir, escapingGuidePath));

        const manifestJson = await contextListJson({ targets: [target.id], cwd: env.productDir });
        const manifest = parseContextManifest(manifestJson);

        expect(allManifestPaths(manifest)).not.toContain(escapingGuidePath);
        expect(manifestJson).not.toContain(secretMarker);
      });
    });
  });
});
