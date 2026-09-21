import { describe, expect, it } from "vitest";

import { KIND_REGISTRY } from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowJson,
  contextShowText,
  divergentOrderSlugPair,
  documentAt,
  documentPaths,
  entryPaths,
  referencePaths,
  rootedSpecPath,
  specTreeKindsConfig,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context read-set boundaries", () => {
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
    });
  });

  it("references issue notes on the target path by path alone and never carries an issue body, heading, excerpt, or count", async () => {
    await withRichContextEnv(async (env, paths) => {
      const heading = paths.targetIssuesText.replace(/^﻿/, "").split("\n")[0];
      for (
        const output of [
          await contextShowText({ targets: [paths.targetId], cwd: env.productDir }),
          await contextShowJson({ targets: [paths.targetId], cwd: env.productDir }),
        ]
      ) {
        expect(output).toContain(paths.targetIssuesPath);
        expect(output).toContain(paths.rootIssuesPath);
        expect(output).not.toContain(heading);
      }
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentPaths(entries)).not.toContain(paths.targetIssuesPath);
      expect(documentPaths(entries)).not.toContain(paths.rootIssuesPath);
    });
  });

  it("keeps evidence, runtime guides, non-lifecycle overlays, and coordination plans outside show", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (
        const target of [[], [paths.targetId], [paths.rootDirectory]]
      ) {
        const entries = await contextShowEntries({ targets: target, cwd: env.productDir });
        for (
          const excluded of [
            paths.evidencePath,
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

  it("orders selected tree entries depth-first by numeric index with the complete entry name as an ordinal tie-break", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const fixture = env.fixture;
      const nodeSuffix = KIND_REGISTRY[fixture.root.kind].suffix;
      const opening = KIND_REGISTRY[fixture.root.kind].opening;
      const pair = divergentOrderSlugPair();
      const sharedOrder = Math.max(fixture.root.order, fixture.peer.order) + 1;
      const codeUnitFirstDirectory = `${sharedOrder}-${pair.codeUnitFirst}${nodeSuffix}`;
      const localeFirstDirectory = `${sharedOrder}-${pair.localeFirst}${nodeSuffix}`;
      const laterSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const laterDirectory = `${sharedOrder + 1}-${laterSlug}${nodeSuffix}`;
      for (
        const [directory, slug] of [
          [codeUnitFirstDirectory, pair.codeUnitFirst],
          [localeFirstDirectory, pair.localeFirst],
          [laterDirectory, laterSlug],
        ] as const
      ) {
        await env.writeRaw(rootedSpecPath(`${directory}/${slug}.md`), `# ${slug}\n\n${opening} ${slug}\n`);
      }
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      // Lower index first; at the shared index the code-unit order wins even
      // though locale collation reverses the pair; the later index last.
      const positions = [codeUnitFirstDirectory, localeFirstDirectory, laterDirectory].map((directory) =>
        documentPaths(entries).findIndex((path) => path.startsWith(`${rootedSpecPath(directory)}/`))
      );
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    });
  });
});
