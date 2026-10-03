import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
  SPEC_CONTEXT_SELECTION_REASON,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import {
  divergentOrderSlugPair,
  freeSiblingOrder,
  markdownFixtureBody,
  richContextCanonicalTarget,
  type RichContextPaths,
  rootedSpecPath,
  siblingDirectoryName,
  SPEC_CONTEXT_ESCAPE_TARGET_FILENAME,
  specFilePath,
  specFixtureBody,
} from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextListJson,
  contextListManifest,
  contextListText,
  contextShowEntries,
  entryPaths,
  manifestEntryAt,
  manifestPathsForReason,
  parseContextManifest,
  specTreeKindsConfig,
  trackSpecTreeInGit,
  withOutsideProductDir,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

/** The target sets the boundary cases request: a nested node, its ancestor, the product root, and two composed targets. */
function boundaryTargetSets(paths: RichContextPaths): readonly (readonly string[])[] {
  return [
    [paths.targetId],
    [paths.rootDirectory],
    [SPEC_CONTEXT_PRODUCT_ROOT_TARGET],
    [paths.targetId, paths.higherIndexSiblingPath],
  ];
}

type WalkStep = readonly [group: number, index: number, name: string];

/**
 * The position the declared depth-first walk gives a selected tree path, as
 * one step per directory level. A walked directory contributes its own
 * artifacts first — its spec (the product spec at the product root), then
 * its `ISSUES.md`, then its outcome record, then its `knowledge/index.md` —
 * and then one sequence merging its decisions and child nodes by ascending
 * numeric index, with the complete entry name compared by code units as the
 * equal-index tie-break.
 */
function walkSteps(path: string): readonly WalkStep[] {
  const ownArtifacts = [
    SPEC_CONTEXT_OPTIONAL_ARTIFACT.ISSUES,
    SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX,
    SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX,
  ];
  const sequenced = (name: string): WalkStep => [
    1,
    Number(name.split(SPEC_TREE_GRAMMAR.ORDER.SEPARATOR)[0]),
    name,
  ];
  const relative = path.slice(rootedSpecPath("").length);
  const knowledgeIndex = SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX;
  const isKnowledgeIndex = relative === knowledgeIndex
    || relative.endsWith(`${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${knowledgeIndex}`);
  const segments = relative.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const fileSegments = isKnowledgeIndex ? knowledgeIndex.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).length : 1;
  const directories = segments.slice(0, segments.length - fileSegments);
  const file = segments.slice(segments.length - fileSegments).join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
  const isDecision = [KIND_REGISTRY.adr.suffix, KIND_REGISTRY.pdr.suffix].some((suffix) => file.endsWith(suffix));
  const ownRank = 1 + ownArtifacts.findIndex((artifact) => file === artifact || file.endsWith(artifact));
  return [...directories.map(sequenced), isDecision ? sequenced(file) : [0, ownRank, ""]];
}

function compareWalkPositions(left: string, right: string): number {
  const leftSteps = walkSteps(left);
  const rightSteps = walkSteps(right);
  for (let level = 0; level < Math.min(leftSteps.length, rightSteps.length); level += 1) {
    const [leftGroup, leftIndex, leftName] = leftSteps[level];
    const [rightGroup, rightIndex, rightName] = rightSteps[level];
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  }
  return leftSteps.length - rightSteps.length;
}

describe("spec context manifest boundaries", () => {
  it("carries no entry for a document show does not select, the coordination plans on the path included", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const targets of boundaryTargetSets(paths)) {
        const manifestPaths = allManifestPaths(await contextListManifest({ targets, cwd: env.productDir }));
        const shown = entryPaths(await contextShowEntries({ targets, cwd: env.productDir }));
        for (const path of manifestPaths) expect(shown, `${targets.join(" ")} ${path}`).toContain(path);
        for (const plan of [paths.rootPlanPath, paths.ancestorPlanPath]) {
          expect(manifestPaths, `${targets.join(" ")} ${plan}`).not.toContain(plan);
        }
      }
    });
  });

  it("names every existing issue note on the target path as a path-only entry", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      expect(manifestPathsForReason(manifest, SPEC_CONTEXT_SELECTION_REASON.ISSUE)).toEqual([
        paths.rootIssuesPath,
        paths.ancestorIssuesPath,
        paths.targetIssuesPath,
      ]);
    });
  });

  it("never carries an issue note's body, heading, excerpt, or count", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.targetId], cwd: env.productDir };
      for (const output of [await contextListText(options), await contextListJson(options)]) {
        expect(output).toContain(paths.targetIssuesPath);
        expect(output).not.toContain(paths.targetIssuesHeading);
      }
      // Each issue entry carries exactly its path, the reference mode, and the
      // one selection naming it: no body, excerpt, or count field.
      const manifest = await contextListManifest(options);
      for (const path of [paths.rootIssuesPath, paths.ancestorIssuesPath, paths.targetIssuesPath]) {
        expect(manifestEntryAt(manifest, path), path).toStrictEqual({
          path,
          mode: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.REFERENCE],
          selections: [
            { target: richContextCanonicalTarget(paths.targetId), reason: SPEC_CONTEXT_SELECTION_REASON.ISSUE },
          ],
        });
      }
    });
  });

  it("keeps evidence, harness guides, local overlays, and unselected file classes outside list", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const targets of boundaryTargetSets(paths)) {
        const manifestPaths = allManifestPaths(await contextListManifest({ targets, cwd: env.productDir }));
        for (
          const excluded of [
            paths.evidencePath,
            paths.targetEvalPath,
            paths.targetProbePath,
            ...paths.rootGuidePaths,
            paths.ancestorGuidePath,
            paths.lifecycleOverlayPath,
            paths.listedOverlayPath,
            paths.lowerSiblingOutcomePath,
            paths.lowerSiblingKnowledgeIndexPath,
          ]
        ) {
          expect(manifestPaths, `${targets.join(" ")} ${excluded}`).not.toContain(excluded);
        }
      }
    });
  });

  it("keeps a harness guide whose symbolic link escapes the product directory outside list", async () => {
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

  it("orders every entry by the declared depth-first walk from the product root", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const targets of boundaryTargetSets(paths)) {
        const manifestPaths = allManifestPaths(await contextListManifest({ targets, cwd: env.productDir }));
        expect(manifestPaths, targets.join(" ")).toEqual([...manifestPaths].sort(compareWalkPositions));
      }
      // The nested target's subtree interleaves its own artifacts, a decision,
      // and a child node, and the peer's cited decisions share one index with
      // names whose code-unit order reverses their locale order.
      const nested = allManifestPaths(
        await contextListManifest({ targets: [paths.targetId], cwd: env.productDir }),
      );
      for (
        const path of [
          paths.targetOutcomePath,
          paths.targetKnowledgeIndexPath,
          paths.targetDecisionPath,
          paths.deepDescendantSpecPath,
          paths.citedDecisionPath,
          paths.peerDecisionPath,
        ]
      ) {
        expect(nested, path).toContain(path);
      }
    });
  });

  it("orders equal-index siblings by code units where locale collation disagrees, tracked or not", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = env.fixture;
      const opening = KIND_REGISTRY[fixture.root.kind].opening;
      const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const { codeUnitFirst: codeUnitFirstSlug, localeFirst: localeFirstSlug } = divergentOrderSlugPair();

      const lowerOrder = freeSiblingOrder(fixture);
      const targetOrder = lowerOrder + 1;
      const higherOrder = targetOrder + 1;
      const targetDirectory = siblingDirectoryName(fixture, targetOrder, slug);
      await env.writeRaw(specFilePath(targetDirectory, slug), specFixtureBody(slug, opening));
      const pairSpecPaths: string[] = [];
      for (const order of [lowerOrder, targetOrder, higherOrder]) {
        for (const pairSlug of [codeUnitFirstSlug, localeFirstSlug]) {
          const directory = siblingDirectoryName(fixture, order, pairSlug);
          await env.writeRaw(specFilePath(directory, pairSlug), specFixtureBody(pairSlug, opening));
          pairSpecPaths.push(specFilePath(directory, pairSlug));
        }
      }

      const pairOrderIn = async (): Promise<readonly string[]> =>
        allManifestPaths(await contextListManifest({ targets: [targetDirectory], cwd: env.productDir }))
          .filter((path) => pairSpecPaths.includes(path));

      // Lower index first; at each index the code-unit order wins although
      // locale collation reverses the pair.
      expect(await pairOrderIn()).toStrictEqual(pairSpecPaths);
      // The tracked-paths branch is the one a real git worktree takes.
      await trackSpecTreeInGit(env);
      expect(await pairOrderIn()).toStrictEqual(pairSpecPaths);
    });
  });
});
