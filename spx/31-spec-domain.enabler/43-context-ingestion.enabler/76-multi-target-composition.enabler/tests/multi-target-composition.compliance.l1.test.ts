import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX } from "@/interfaces/cli/spec-context-contract";
import { SPEC_CONTEXT_TARGET_FAILURE_KIND } from "@/lib/spec-tree";
import {
  arbitrarySpecContextInvalidUtf8Bytes,
  specContextUnknownTarget,
} from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  documentAt,
  entryPaths,
  methodologyTreeConfig,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context loaded-declaration boundaries", () => {
  it("persists nothing for a loaded declaration and reconstructs it from the current tree, so a changed covered entry renders as it is now", async () => {
    await withRichContextEnv(async (env, paths) => {
      const before = (await readdir(env.productDir, { recursive: true })).sort();
      await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir, loadedTargets: [paths.targetId] });
      expect((await readdir(env.productDir, { recursive: true })).sort()).toEqual(before);
      // The declaration names the projection as it stands: after the target's
      // spec changes, a run declaring the target loaded still projects the
      // current content and suppresses it, so the caller who wants the change
      // drops the declaration and receives the new content.
      const changed = `${paths.sourceText[paths.targetSpecPath]}\nChanged after loading.\n`;
      await env.writeRaw(paths.targetSpecPath, changed);
      const declared = await contextShowEntries({
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedTargets: [paths.targetId],
      });
      expect(declared).toEqual([]);
      const fresh = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(fresh, paths.targetSpecPath)?.content).toContain("Changed after loading.");
    });
  });

  it("scopes --loaded-methodology to the methodology document and the product declarations to product entries", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const productPath = snapshot.product?.ref?.path;
      const base = { targets: [target.id], cwd: env.productDir, methodologyTreeRoot: fixture.treeRoot };
      // --methodology with --loaded-product: the foundation still leads and
      // the product entries discovery covered are gone.
      const withProductLoaded = await contextShowEntries({ ...base, methodology: true, loadedProduct: true });
      expect(withProductLoaded[0]?.path).toBe(fixture.documentPath);
      expect(entryPaths(withProductLoaded)).not.toContain(productPath);
      // --loaded-methodology alone leaves every product entry in place.
      const withMethodologyLoaded = await contextShowEntries({ ...base, loadedMethodology: true });
      expect(withMethodologyLoaded[0]?.path).toBe(productPath);
      expect(entryPaths(withMethodologyLoaded)).not.toContain(fixture.documentPath);
    });
  });

  it("aborts the whole projection before output on any requested or loaded target failure or any selected document failure", async () => {
    await withRichContextEnv(async (env, paths) => {
      const unknown = specContextUnknownTarget(env.fixture);
      const unresolvedPrefix = SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX[SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED];
      const requested = await contextShowFailure({ targets: [paths.targetId, unknown], cwd: env.productDir });
      expect(requested).toContain(unresolvedPrefix);
      expect(requested).toContain(unknown);
      expect(requested).not.toContain(paths.productPath);
      const loaded = await contextShowFailure({
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedTargets: [unknown],
      });
      expect(loaded).toContain(unresolvedPrefix);
      expect(loaded).toContain(unknown);
      // A document the loaded projection reconstructs fails the run even
      // though suppression would have removed it from the output.
      await writeFile(
        join(env.productDir, paths.higherIndexSiblingSpecPath),
        Buffer.from(sampleSpecTreeTestValue(arbitrarySpecContextInvalidUtf8Bytes())),
      );
      const document = await contextShowFailure({
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedTargets: [paths.targetId],
      });
      expect(document).toContain(paths.higherIndexSiblingSpecPath);
    });
  });
});
