import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL, SPEC_CONTEXT_TEXT_SELECTION_INDENT } from "@/commands/spec/context";
import { SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import {
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
  SPEC_CONTEXT_SELECTION_REASON,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import {
  markdownFixtureBody,
  rootedArtifactPath,
  rootedSpecPath,
  specLessNodeDirectories,
} from "@testing/generators/spec-tree/rich-context";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  allManifestPaths,
  contextListJson,
  contextListManifest,
  contextListText,
  contextShowEntries,
  contextShowJson,
  contextShowText,
  documentAt,
  documentPaths,
  entryPaths,
  manifestEntryAt,
  METHODOLOGY_FIXTURE_VERSION,
  parseContextEntries,
  parseContextManifest,
  referencePaths,
  runSpecDescriptor,
  specTreeKindsConfig,
  trackSpecTreeInGit,
  withEmptyContextTreeEnv,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context list and show", () => {
  it("emits the versioned structural manifest from list and framed entries without manifest fields from show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(await contextListJson({ targets: [paths.targetId], cwd: env.productDir }));
      // The manifest document carries exactly the declared top-level fields,
      // and each entry exactly its path, mode, per-target selections, and —
      // on a decision reached only by citation — the documents citing it.
      expect(manifest).toStrictEqual({
        schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
        bootstrap: false,
        methodology: manifest.methodology,
        entries: manifest.entries,
      });
      expect(manifest.entries.length).toBeGreaterThan(0);
      for (const entry of manifest.entries) {
        expect(entry, entry.path).toStrictEqual({
          path: entry.path,
          mode: entry.mode,
          selections: entry.selections.map(({ target, reason }) => ({ target, reason })),
          ...(entry.citedBy === undefined ? {} : { citedBy: entry.citedBy }),
        });
      }
      expect(manifestEntryAt(manifest, paths.targetSpecPath)).toStrictEqual({
        path: paths.targetSpecPath,
        mode: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL],
        selections: [{ target: rootedSpecPath(paths.targetId), reason: SPEC_CONTEXT_SELECTION_REASON.TARGET }],
      });

      const shownJson = await contextShowJson({ targets: [paths.targetId], cwd: env.productDir });
      const shown = JSON.parse(shownJson) as Record<string, unknown>;
      expect(Object.keys(shown)).toEqual([SPEC_CONTEXT_ENTRIES_KEY]);
      // Every shown entry carries only its framing fields: no mode, selection,
      // citing-document, version, or count field from the manifest.
      const entries = parseContextEntries(shownJson);
      expect(entryPaths(entries)).toEqual(allManifestPaths(manifest));
      for (const entry of entries) {
        expect(entry, entry.path).toStrictEqual(
          entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT
            ? { type: entry.type, path: entry.path, metadata: entry.metadata, content: entry.content }
            : { type: entry.type, path: entry.path },
        );
      }
      const text = await contextShowText({ targets: [paths.targetId], cwd: env.productDir });
      expect(text.startsWith(`<${SPEC_CONTEXT_FRAME.DOCUMENT}`)).toBe(true);
      expect(text).not.toContain(`${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}:`);
      expect(entries[0]?.path).toBe(paths.productPath);
    });
  });

  it("supplies the complete product spec and a depth-bounded Product Tree map when show has no target", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      // The product spec is the one Full document; every node at depths one and
      // two and every decision at depths zero through two is a Digest. Targetless
      // discovery follows no citation, so the decisions selected documents cite
      // stay Digest like every other decision on the map.
      expect(documentAt(entries, paths.productPath)?.content).toBe(paths.sourceText[paths.productPath]);
      for (
        const digest of [
          paths.rootSpecPath,
          paths.targetSpecPath,
          paths.lowerSiblingSpecPath,
          paths.sameIndexSiblingSpecPath,
          paths.higherIndexSiblingSpecPath,
          paths.higherProductDecisionPath,
          paths.ancestorDecisionPath,
          paths.higherAncestorDecisionPath,
          paths.peerDecisionPath,
          paths.citedDecisionPath,
          paths.transitiveCitedDecisionPath,
        ]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      // The cited decisions sit at their structural positions inside the peer
      // node's walk — its spec, then its decisions in ascending index with the
      // complete filename as ordinal tie-break — and nothing is appended: the
      // peer node's entries form one contiguous run in that order.
      const peerPrefix = `${paths.higherIndexSiblingPath}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;
      const peerDecisions = [
        { path: paths.citedDecisionPath, order: env.fixture.decision.order },
        { path: paths.peerDecisionPath, order: env.fixture.decision.order },
        { path: paths.transitiveCitedDecisionPath, order: env.fixture.peer.order },
      ].sort((left, right) =>
        left.order - right.order || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      );
      const peerStart = entryPaths(entries).indexOf(paths.higherIndexSiblingSpecPath);
      expect(entryPaths(entries).slice(peerStart, peerStart + 1 + peerDecisions.length)).toEqual([
        paths.higherIndexSiblingSpecPath,
        ...peerDecisions.map(({ path }) => path),
      ]);
      expect(entryPaths(entries).filter((path) => path.startsWith(peerPrefix))).toHaveLength(
        1 + peerDecisions.length,
      );
      expect(referencePaths(entries)).toEqual([paths.rootIssuesPath, paths.ancestorIssuesPath, paths.targetIssuesPath]);
      expect(documentPaths(entries)).not.toContain(paths.targetOutcomePath);
      expect(entryPaths(entries)).not.toContain(paths.targetKnowledgeIndexPath);
      // The bound stops below the target: a node one level deeper is absent
      // here while a targeted projection of its parent still carries it.
      expect(entryPaths(entries)).not.toContain(paths.deepDescendantSpecPath);
      expect(entryPaths(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir })))
        .toContain(paths.deepDescendantSpecPath);
    });
  });

  it("succeeds with empty stdout, and with an empty entry list under --json, when show has no target over a tree with no product spec, node, or decision", async () => {
    await withEmptyContextTreeEnv(specTreeKindsConfig(), async (env) => {
      const context = { productDir: env.productDir };
      const text = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.SHOW);
      expect(text.exitCode, text.stderr).toBeUndefined();
      expect(text.stdout).toHaveLength(0);
      const json = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.SHOW, SPEC_DOMAIN_CLI.JSON_OPTION);
      expect(json.exitCode, json.stderr).toBeUndefined();
      expect(JSON.parse(json.stdout)).toEqual({ [SPEC_CONTEXT_ENTRIES_KEY]: [] });
    });
  });

  it("supplies Full target and ancestor context, Digest sibling and child awareness, decisions, and path references for a targeted show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      for (
        const full of [
          paths.productPath,
          paths.rootSpecPath,
          paths.ancestorDecisionPath,
          paths.targetDecisionPath,
        ]
      ) {
        expect(documentAt(entries, full)?.content, full).toBe(paths.sourceText[full]);
      }
      // An ancestor's decision at or above the index of the child the path
      // continues through governs no part of the path.
      for (const unselected of [paths.higherAncestorDecisionPath, paths.higherProductDecisionPath]) {
        expect(entryPaths(entries), unselected).not.toContain(unselected);
      }
      expect(documentAt(entries, paths.targetOutcomePath)?.content).toBe(paths.bodyText[paths.targetOutcomePath]);
      const target = documentAt(entries, paths.targetSpecPath);
      expect(target?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(target?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      for (
        const digest of [
          paths.lowerSiblingSpecPath,
          paths.sameIndexSiblingSpecPath,
          paths.higherIndexSiblingSpecPath,
          paths.deepDescendantSpecPath,
        ]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      expect(referencePaths(entries)).toEqual([
        paths.rootIssuesPath,
        paths.ancestorIssuesPath,
        paths.targetIssuesPath,
        paths.targetKnowledgeIndexPath,
      ]);
      // Cited decisions the walk did not select append after the structural
      // entries in canonical path order. The cited and peer decisions share an
      // index and carry the divergent slug pair, so code-unit order places the
      // cited decision first while locale collation would reverse them.
      const appended = documentPaths(entries).slice(-3);
      expect(new Set(appended)).toEqual(
        new Set([paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath]),
      );
      expect(appended.indexOf(paths.citedDecisionPath)).toBeLessThan(appended.indexOf(paths.peerDecisionPath));
      const rootEntries = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(documentAt(rootEntries, paths.targetSpecPath)?.content).toBe(paths.openingText[paths.targetSpecPath]);
    });
  });

  it("selects the same targetless and targeted show entries when tracked node directories without spec files join the tree", async () => {
    await withRichContextEnv(async (env, paths) => {
      await trackSpecTreeInGit(env);
      const targetless = await contextShowEntries({ targets: [], cwd: env.productDir });
      const targeted = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const specLess = specLessNodeDirectories(env.fixture, paths);
      for (const [path, text] of Object.entries(specLess.files)) await env.writeRaw(path, text);
      await trackSpecTreeInGit(env);
      // The snapshot walks each directory as a node, so the projection meets
      // a top-level sibling, a depth-two sibling, and an immediate child of
      // the target that each name a spec file no tracked path holds.
      expect((await env.readFilesystemSnapshot()).allNodes.map((node) => node.id)).toEqual(
        expect.arrayContaining([...specLess.nodeIds]),
      );
      expect(await contextShowEntries({ targets: [], cwd: env.productDir })).toEqual(targetless);
      expect(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir })).toEqual(targeted);
    });
  });

  it("carries the manifest schema version and the snapshot-derived bootstrap flag", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      expect(snapshot.allNodes.length).toBeGreaterThan(0);
      const manifest = await contextListManifest({ targets: [rootedSpecPath(target.id)], cwd: env.productDir });
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.bootstrap).toBe(false);
    });

    // The same manifest over a tree carrying the product spec and no node
    // reports the opposite flag, so a fixed value in place of the derivation
    // fails one of the two. The product-root target selects only the product
    // spec, and the manifest names that target by its canonical spelling.
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      const productPath = rootedArtifactPath(
        undefined,
        `${env.fixture.product.title}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
      );
      await env.writeRaw(productPath, markdownFixtureBody(env.fixture.product.title));
      const manifest = await contextListManifest({
        targets: [SPEC_TREE_CONFIG.ROOT_DIRECTORY],
        cwd: env.productDir,
      });
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.bootstrap).toBe(true);
      expect(manifest.entries).toStrictEqual([{
        path: productPath,
        mode: SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL],
        selections: [{ target: SPEC_CONTEXT_PRODUCT_ROOT_TARGET, reason: SPEC_CONTEXT_SELECTION_REASON.TARGET }],
      }]);
    });
  });

  it("renders the manifest as labelled text equivalent to its JSON representation", async () => {
    await withRichContextEnv(async (env, paths) => {
      const targets = [rootedSpecPath(paths.targetId), paths.rootDirectory];
      const textOutput = await contextListText({ targets, cwd: env.productDir });
      const manifest = parseContextManifest(await contextListJson({ targets, cwd: env.productDir }));
      // The labelled header, then one line per entry naming its mode and path,
      // each followed by one indented line per selection naming its reason
      // and target. An entry line may carry more after its mode and path, such
      // as the documents citing a decision reached only by citation.
      expect(textOutput.split("\n")).toEqual([
        `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${manifest.schemaVersion}`,
        `${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${manifest.bootstrap}`,
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${DEFAULT_METHODOLOGY_SOURCE}@${METHODOLOGY_FIXTURE_VERSION}`,
        ...manifest.entries.flatMap((entry) => [
          entry.citedBy === undefined
            ? `${entry.mode} ${entry.path}`
            : expect.stringContaining(`${entry.mode} ${entry.path} `),
          ...entry.selections.map(({ reason, target }) => `${SPEC_CONTEXT_TEXT_SELECTION_INDENT}${reason} ${target}`),
        ]),
      ]);
      expect(manifest.entries.some((entry) => entry.citedBy !== undefined)).toBe(true);
      expect(manifest.entries.some((entry) => entry.selections.length > 1)).toBe(true);
    });
  });
});
