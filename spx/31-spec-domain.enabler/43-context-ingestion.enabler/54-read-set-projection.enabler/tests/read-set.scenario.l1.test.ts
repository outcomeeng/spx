import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  SPEC_CONTEXT_CONTENT_FIELDS,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_TREE_GRAMMAR,
  type SpecContextManifest,
} from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextCommand,
  divergentOrderSlugPair,
  listedPaths,
  listedPathsForRole,
  parseContextManifest,
  readPaths,
  readPathsForRole,
  rootedSpecPath,
  specTreeKindsConfig,
  trackedSpecContextGitDependencies,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

describe("spec context read set", () => {
  it("includes coordination notes from the product root, ancestors, and the target in walk order", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      expect(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.COORDINATION)).toEqual([
        paths.rootPlanPath,
        paths.rootIssuesPath,
        paths.ancestorPlanPath,
        paths.targetIssuesPath,
      ]);
    });
  });

  it("lists runtime guides along the target path with no read obligation, content, digest, or byte count", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir, content: true }),
      );
      expect(listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.GUIDE)).toEqual([
        ...paths.rootGuidePaths,
        paths.ancestorGuidePath,
      ]);
      for (const guidePath of [...paths.rootGuidePaths, paths.ancestorGuidePath]) {
        expect(readPaths(manifest)).not.toContain(guidePath);
        const entry = manifest.listed.find((candidate) => candidate.path === guidePath);
        for (const field of Object.values(SPEC_CONTEXT_CONTENT_FIELDS)) {
          expect(entry).not.toHaveProperty(field);
        }
      }
    });
  });

  it("reads the lifecycle overlay and lists every other overlay", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
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
      await env.writeRaw(codeUnitFirstOverlayPath, "# Code-unit-first overlay\n");
      await env.writeRaw(localeFirstOverlayPath, "# Locale-first overlay\n");

      const overlayPairIn = (manifest: SpecContextManifest): readonly string[] =>
        listedPathsForRole(manifest, SPEC_CONTEXT_LISTED_ROLE.OVERLAY)
          .filter((path) => path === codeUnitFirstOverlayPath || path === localeFirstOverlayPath);

      const fallbackManifest = parseContextManifest(
        await contextCommand({ targets: [paths.targetId], cwd: env.productDir }),
      );
      expect(overlayPairIn(fallbackManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);

      // The tracked-paths branch is the one a real git worktree takes; it sorts
      // through the same comparator at a different call site.
      const snapshot = await env.readFilesystemSnapshot();
      const trackedPaths = [
        ...snapshot.entries
          .map((entry) => entry.ref?.path)
          .filter((path): path is string => path !== undefined),
        paths.lifecycleOverlayPath,
        codeUnitFirstOverlayPath,
        localeFirstOverlayPath,
      ];
      const trackedManifest = parseContextManifest(
        await contextCommand({
          targets: [paths.targetId],
          cwd: env.productDir,
          gitDependencies: trackedSpecContextGitDependencies(env.productDir, trackedPaths),
        }),
      );
      expect(overlayPairIn(trackedManifest)).toStrictEqual([codeUnitFirstOverlayPath, localeFirstOverlayPath]);
    });
  });

  it("orders sibling groups by code units where locale collation disagrees", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = env.fixture;
      const nodeSuffix = KIND_REGISTRY[fixture.root.kind].suffix;
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const { codeUnitFirst: codeUnitFirstSlug, localeFirst: localeFirstSlug } = divergentOrderSlugPair();

      const lowerOrder = Math.max(fixture.root.order, fixture.peer.order) + 1;
      const targetOrder = lowerOrder + 1;
      const higherOrder = targetOrder + 1;
      const targetDirectory = `${targetOrder}-${slug}${nodeSuffix}`;
      const pairDirectories = (order: number): readonly [string, string] => [
        `${order}-${codeUnitFirstSlug}${nodeSuffix}`,
        `${order}-${localeFirstSlug}${nodeSuffix}`,
      ];
      const [lowerCodeUnitFirst, lowerLocaleFirst] = pairDirectories(lowerOrder);
      const [sameCodeUnitFirst, sameLocaleFirst] = pairDirectories(targetOrder);
      const [higherCodeUnitFirst, higherLocaleFirst] = pairDirectories(higherOrder);

      await env.writeRaw(rootedSpecPath(`${targetDirectory}/${slug}.md`), "# Ordering target\n");
      await env.writeRaw(rootedSpecPath(`${lowerCodeUnitFirst}/${codeUnitFirstSlug}.md`), "# Lower pair\n");
      await env.writeRaw(rootedSpecPath(`${lowerLocaleFirst}/${localeFirstSlug}.md`), "# Lower pair\n");
      await env.writeRaw(rootedSpecPath(`${sameCodeUnitFirst}/${codeUnitFirstSlug}.md`), "# Same pair\n");
      await env.writeRaw(rootedSpecPath(`${sameLocaleFirst}/${localeFirstSlug}.md`), "# Same pair\n");
      await env.writeRaw(rootedSpecPath(`${higherCodeUnitFirst}/${codeUnitFirstSlug}.md`), "# Higher pair\n");
      await env.writeRaw(rootedSpecPath(`${higherLocaleFirst}/${localeFirstSlug}.md`), "# Higher pair\n");

      const manifest = parseContextManifest(
        await contextCommand({ targets: [targetDirectory], cwd: env.productDir }),
      );

      const lowerPair = readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING)
        .filter((path) =>
          path.startsWith(rootedSpecPath(`${lowerCodeUnitFirst}/`))
          || path.startsWith(rootedSpecPath(`${lowerLocaleFirst}/`))
        );
      expect(lowerPair).toStrictEqual([
        rootedSpecPath(`${lowerCodeUnitFirst}/${codeUnitFirstSlug}.md`),
        rootedSpecPath(`${lowerLocaleFirst}/${localeFirstSlug}.md`),
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

  it("binds no entry for a symbolic link whose canonical target escapes the product directory", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const outsideParent = await createTempDir("spx-context-outside-");
      try {
        const outsideSecretPath = join(outsideParent, "outside-secret.md");
        // The marker carries no newline or JSON-escapable character, so it
        // appears verbatim inside a JSON-encoded content field — a leak is
        // observable in the raw output regardless of JSON string escaping.
        const secretMarker = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        await writeFile(outsideSecretPath, `# Outside secret ${secretMarker}\n`);
        const escapingGuidePath = SPEC_TREE_GRAMMAR.GUIDE_FILES[1];
        await symlink(outsideSecretPath, join(env.productDir, escapingGuidePath));

        const manifestJson = await contextCommand({
          targets: [target.id],
          cwd: env.productDir,
          content: true,
        });
        const manifest = parseContextManifest(manifestJson);

        expect(allManifestPaths(manifest)).not.toContain(escapingGuidePath);
        expect(manifestJson).not.toContain(secretMarker);
      } finally {
        await removeTempDir(outsideParent);
      }
    });
  });
});
