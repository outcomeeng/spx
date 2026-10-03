import { describe, expect, it } from "vitest";

import {
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
  SPEC_CONTEXT_REASON_MODE,
  SPEC_CONTEXT_SELECTION_REASON,
  type SpecContextEntry,
  type SpecContextModeName,
} from "@/lib/spec-tree";
import {
  richContextCanonicalTarget,
  type RichContextPaths,
  richContextReasonBindings,
  richContextTargetAliases,
} from "@testing/generators/spec-tree/rich-context";
import {
  allManifestPaths,
  contextListManifest,
  contextShowEntries,
  entryPaths,
  manifestEntryAt,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

/**
 * Every non-empty combination of the rich fixture's distinct target
 * identities — product root, ancestor node, nested target, higher-index
 * sibling — each requested through one accepted spelling: the complete finite
 * domain of target sets the fixture resolves.
 */
function targetSets(paths: RichContextPaths): readonly (readonly string[])[] {
  const identities = richContextTargetAliases(paths).flatMap((aliases) => aliases.slice(0, 1));
  return identities
    .reduce<readonly (readonly string[])[]>(
      (subsets, identity) => [...subsets, ...subsets.map((subset) => [...subset, identity])],
      [[]],
    )
    .filter((subset) => subset.length > 0);
}

/**
 * How `show` actually delivered an entry, judged against the text the
 * generator wrote rather than against any manifest field: a reference entry is
 * delivered by reference, a document carrying its complete body in Full, and a
 * document carrying only its opening paragraph or decision statement in
 * Digest. A document matching none of them yields no mode.
 */
function deliveredMode(entry: SpecContextEntry, paths: RichContextPaths): SpecContextModeName | undefined {
  if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.REFERENCE) return SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.REFERENCE];
  if (entry.content === (paths.bodyText[entry.path] ?? paths.sourceText[entry.path])) {
    return SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL];
  }
  if (entry.content === paths.openingText[entry.path]) return SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.DIGEST];
  return undefined;
}

describe("spec context manifest entries", () => {
  it("maps every entry show selects to exactly one list entry, in show's order, for every target set", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const targets of targetSets(paths)) {
        const manifest = await contextListManifest({ targets, cwd: env.productDir });
        const shown = entryPaths(await contextShowEntries({ targets, cwd: env.productDir }));
        expect(allManifestPaths(manifest), targets.join(" ")).toEqual(shown);
        expect(new Set(allManifestPaths(manifest)).size, targets.join(" ")).toBe(manifest.entries.length);
      }
    });
  });

  it("composes each entry's mode as the highest mode its selections require, which is how show delivers it", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const targets of targetSets(paths)) {
        const manifest = await contextListManifest({ targets, cwd: env.productDir });
        const shown = await contextShowEntries({ targets, cwd: env.productDir });
        for (const entry of manifest.entries) {
          // Full over Digest over Reference: the numeric order the
          // source-owned mode registry declares.
          const required = entry.selections.map(({ reason }) => SPEC_CONTEXT_REASON_MODE[reason]);
          expect(required.length, `${targets.join(" ")} ${entry.path}`).toBeGreaterThan(0);
          const highest = required.reduce((left, right) => right > left ? right : left);
          expect(entry.mode, `${targets.join(" ")} ${entry.path}`).toBe(SPEC_CONTEXT_MODE_NAME[highest]);
          const delivered = shown.find((shownEntry) => shownEntry.path === entry.path);
          expect(delivered && deliveredMode(delivered, paths), `${targets.join(" ")} ${entry.path}`).toBe(entry.mode);
        }
      }
      // A selection set whose requirements differ composes upward: the nested
      // target requires Full as itself and Digest as the ancestor's immediate
      // child, and its one entry is delivered Full.
      const composed = await contextListManifest({
        targets: [paths.targetId, paths.rootDirectory],
        cwd: env.productDir,
      });
      expect(manifestEntryAt(composed, paths.targetSpecPath)).toStrictEqual({
        path: paths.targetSpecPath,
        mode: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL],
        selections: [
          {
            target: richContextCanonicalTarget(paths.rootDirectory),
            reason: SPEC_CONTEXT_SELECTION_REASON.IMMEDIATE_CHILD,
          },
          { target: richContextCanonicalTarget(paths.targetId), reason: SPEC_CONTEXT_SELECTION_REASON.TARGET },
        ],
      });
    });
  });

  it.each(Object.values(SPEC_CONTEXT_SELECTION_REASON))(
    "records the %s reason with the one projection mode it requires",
    async (reason) => {
      await withRichContextEnv(async (env, paths) => {
        const binding = richContextReasonBindings(paths)[reason];
        const manifest = await contextListManifest({ targets: [binding.targetId], cwd: env.productDir });
        const entry = manifestEntryAt(manifest, binding.path);

        expect(entry?.selections).toStrictEqual([{ target: richContextCanonicalTarget(binding.targetId), reason }]);
        expect(entry?.mode).toBe(SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_REASON_MODE[reason]]);
        const shown = await contextShowEntries({ targets: [binding.targetId], cwd: env.productDir });
        const delivered = shown.find((shownEntry) => shownEntry.path === binding.path);
        expect(delivered && deliveredMode(delivered, paths)).toBe(entry?.mode);
      });
    },
  );

  it("records the first applicable reason in precedence where several relations hold for one target", async () => {
    await withRichContextEnv(async (env, paths) => {
      // An explicit product-root target is both the target and the product:
      // its spec and its root decisions record `target`, never `product`.
      const productRoot = await contextListManifest({
        targets: [SPEC_CONTEXT_PRODUCT_ROOT_TARGET],
        cwd: env.productDir,
      });
      for (const path of [paths.productPath, paths.higherProductDecisionPath]) {
        expect(manifestEntryAt(productRoot, path)?.selections, path).toStrictEqual([
          { target: SPEC_CONTEXT_PRODUCT_ROOT_TARGET, reason: SPEC_CONTEXT_SELECTION_REASON.TARGET },
        ]);
      }
      expect(manifestEntryAt(productRoot, paths.rootSpecPath)?.selections).toStrictEqual([
        { target: SPEC_CONTEXT_PRODUCT_ROOT_TARGET, reason: SPEC_CONTEXT_SELECTION_REASON.IMMEDIATE_CHILD },
      ]);
      expect(manifestEntryAt(productRoot, paths.rootKnowledgeIndexPath)?.selections).toStrictEqual([
        { target: SPEC_CONTEXT_PRODUCT_ROOT_TARGET, reason: SPEC_CONTEXT_SELECTION_REASON.KNOWLEDGE_INDEX },
      ]);

      // On a node path the product spec records `product`, the decision
      // selected at the ancestor records `ancestor`, and the target's own
      // decision records `target`.
      const nested = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const nestedTarget = richContextCanonicalTarget(paths.targetId);
      for (
        const [path, reason] of [
          [paths.productPath, SPEC_CONTEXT_SELECTION_REASON.PRODUCT],
          [paths.ancestorDecisionPath, SPEC_CONTEXT_SELECTION_REASON.ANCESTOR],
          [paths.targetDecisionPath, SPEC_CONTEXT_SELECTION_REASON.TARGET],
          [paths.rootIssuesPath, SPEC_CONTEXT_SELECTION_REASON.ISSUE],
        ] as const
      ) {
        expect(manifestEntryAt(nested, path)?.selections, path).toStrictEqual([{ target: nestedTarget, reason }]);
      }
    });
  });
});
