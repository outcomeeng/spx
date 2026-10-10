import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_COMMAND_PATH } from "@/interfaces/cli/spec";
import {
  KIND_REGISTRY,
  SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR,
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import {
  compareSpecContextWalkPositions,
  divergentOrderSlugPair,
  freeSiblingOrder,
  richContextWalkTargetSets,
  rootedSpecPath,
  siblingDirectoryName,
  specFilePath,
  specFixtureBody,
} from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowJson,
  contextShowText,
  documentAt,
  documentPaths,
  entryPaths,
  referencePaths,
  runSpecDescriptor,
  specTreeKindsConfig,
  withEmptyContextTreeEnv,
  withProductlessContextTreeEnv,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context read-set boundaries", () => {
  it("fails every targeted and targetless list and show over a product root with no recognized product spec, whatever else the root holds", async () => {
    await withProductlessContextTreeEnv(specTreeKindsConfig(), async (env, paths) => {
      for (
        const argv of [
          SPEC_CONTEXT_COMMAND_PATH.SHOW,
          [...SPEC_CONTEXT_COMMAND_PATH.SHOW, paths.nodeTargetPath],
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, paths.nodeTargetPath],
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_PRODUCT_ROOT_TARGET],
        ]
      ) {
        const run = await runSpecDescriptor({ productDir: env.productDir }, ...argv);
        expect(run.stdout, argv.join(" ")).toHaveLength(0);
        expect(run.exitCode, argv.join(" ")).toBe(1);
        expect(run.stderr, argv.join(" ")).toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
      }
    });
    await withEmptyContextTreeEnv(specTreeKindsConfig(), async (env) => {
      for (
        const argv of [
          SPEC_CONTEXT_COMMAND_PATH.SHOW,
          [...SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_PRODUCT_ROOT_TARGET],
        ]
      ) {
        const run = await runSpecDescriptor({ productDir: env.productDir }, ...argv);
        expect(run.stdout, argv.join(" ")).toHaveLength(0);
        expect(run.exitCode, argv.join(" ")).toBe(1);
        expect(run.stderr, argv.join(" ")).toContain(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
      }
    });
  });

  it("contributes an outcome record in Full and a knowledge index reference only for an explicitly targeted node", async () => {
    await withRichContextEnv(async (env, paths) => {
      const explicit = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(explicit, paths.targetOutcomePath)?.content).toBe(paths.bodyText[paths.targetOutcomePath]);
      expect(referencePaths(explicit)).toContain(paths.targetKnowledgeIndexPath);
      // As an ancestor the product root contributes no knowledge index, and as
      // an immediate child the target contributes neither artifact.
      expect(entryPaths(explicit)).not.toContain(paths.rootKnowledgeIndexPath);
      const implicit = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(entryPaths(implicit)).not.toContain(paths.targetOutcomePath);
      expect(entryPaths(implicit)).not.toContain(paths.targetKnowledgeIndexPath);
      // A sibling on the target path carries both artifacts and contributes
      // neither, whether the target or its parent is the explicit target.
      const siblingArtifacts = [paths.lowerSiblingOutcomePath, paths.lowerSiblingKnowledgeIndexPath];
      for (const artifact of siblingArtifacts) {
        expect(entryPaths(explicit), artifact).not.toContain(artifact);
        expect(entryPaths(implicit), artifact).not.toContain(artifact);
      }
      // Targeted explicitly, the same sibling contributes both, so the absence
      // above is the implicit role's doing rather than an unselectable fixture.
      const sibling = await contextShowEntries({
        targets: [rootedSpecPath(paths.lowerSiblingDirectory)],
        cwd: env.productDir,
      });
      expect(documentAt(sibling, paths.lowerSiblingOutcomePath)?.content).toBe(
        paths.bodyText[paths.lowerSiblingOutcomePath],
      );
      expect(referencePaths(sibling)).toContain(paths.lowerSiblingKnowledgeIndexPath);
    });
  });

  it("references issue notes on the target path by path alone and never carries an issue body, heading, excerpt, or count", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (
        const output of [
          await contextShowText({ targets: [paths.targetId], cwd: env.productDir }),
          await contextShowJson({ targets: [paths.targetId], cwd: env.productDir }),
        ]
      ) {
        expect(output).toContain(paths.targetIssuesPath);
        expect(output).toContain(paths.ancestorIssuesPath);
        expect(output).toContain(paths.rootIssuesPath);
        expect(output).not.toContain(paths.targetIssuesHeading);
      }
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentPaths(entries)).not.toContain(paths.targetIssuesPath);
      expect(documentPaths(entries)).not.toContain(paths.rootIssuesPath);
    });
  });

  it("keeps evidence, runtime guides, non-lifecycle overlays, and coordination plans outside show", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The fixture materializes an eval and a probe beside the tests under
      // the target, so the three evidence lanes the assertion names are all
      // present on disk.
      for (
        const target of [[], [paths.targetId], [paths.rootDirectory]]
      ) {
        const entries = await contextShowEntries({ targets: target, cwd: env.productDir });
        for (
          const excluded of [
            paths.evidencePath,
            paths.targetEvalPath,
            paths.targetProbePath,
            ...paths.rootGuidePaths,
            paths.ancestorGuidePath,
            paths.listedOverlayPath,
            paths.lifecycleOverlayPath,
            paths.rootPlanPath,
            paths.ancestorPlanPath,
          ]
        ) {
          expect(entryPaths(entries), excluded).not.toContain(excluded);
        }
      }
    });
  });

  it("orders every selected entry by the declared depth-first walk from the product root", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (
        const targets of richContextWalkTargetSets(paths)
      ) {
        const shown = entryPaths(await contextShowEntries({ targets, cwd: env.productDir }));
        expect(shown, targets.join(" ")).toEqual([...shown].sort(compareSpecContextWalkPositions));
      }
      // The nested target's subtree interleaves its own artifacts, a decision,
      // and a child node, and the peer's cited decisions share one index with
      // names whose code-unit order reverses their locale order.
      const nested = entryPaths(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir }));
      for (
        const path of [
          paths.targetIssuesPath,
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

  it("orders selected tree entries depth-first by numeric index with the complete entry name as an ordinal tie-break", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = env.fixture;
      const opening = KIND_REGISTRY[fixture.root.kind].opening;
      const pair = divergentOrderSlugPair();
      const sharedOrder = freeSiblingOrder(fixture);
      const codeUnitFirstDirectory = siblingDirectoryName(fixture, sharedOrder, pair.codeUnitFirst);
      const localeFirstDirectory = siblingDirectoryName(fixture, sharedOrder, pair.localeFirst);
      const laterSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const laterDirectory = siblingDirectoryName(fixture, sharedOrder + 1, laterSlug);
      for (
        const [directory, slug] of [
          [codeUnitFirstDirectory, pair.codeUnitFirst],
          [localeFirstDirectory, pair.localeFirst],
          [laterDirectory, laterSlug],
        ] as const
      ) {
        await env.writeRaw(specFilePath(directory, slug), specFixtureBody(slug, opening));
      }
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      // Lower index first; at the shared index the code-unit order wins even
      // though locale collation reverses the pair; the later index last.
      const positions = [codeUnitFirstDirectory, localeFirstDirectory, laterDirectory].map((directory) =>
        documentPaths(entries).findIndex((path) =>
          path.startsWith(`${rootedSpecPath(directory)}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`)
        )
      );
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });
  });

  it("descends into a node's own subtree before its next sibling", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The target's descendant follows the target and precedes the target's
      // next sibling; a breadth-first walk would place it after both.
      const paths_ = documentPaths(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir }));
      const target = paths_.indexOf(paths.targetSpecPath);
      const descendant = paths_.indexOf(paths.deepDescendantSpecPath);
      const nextSibling = paths_.indexOf(paths.higherIndexSiblingSpecPath);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(descendant).toBeGreaterThan(target);
      expect(nextSibling).toBeGreaterThan(descendant);
    });
  });
});
