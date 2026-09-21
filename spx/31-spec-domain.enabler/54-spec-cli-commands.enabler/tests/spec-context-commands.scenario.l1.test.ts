import { describe, expect, it } from "vitest";

import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListManifest,
  contextShowEntries,
  contextShowFailure,
  contextShowJson,
  contextShowText,
  entryPaths,
  methodologyTreeConfig,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context command handlers", () => {
  it("emits the context library's versioned manifest from list for one or more accepted targets", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({
        targets: [paths.rootDirectory, paths.targetId],
        cwd: env.productDir,
      });
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.targets).toHaveLength(2);
      expect(manifest.coverage).toHaveLength(2);
    });
  });

  it("emits the targetless or targeted projection from show and accepts every declared option under its compatibility rules", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      const fixture = await writeMethodologyTree(env);
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const base = { cwd: env.productDir, methodologyTreeRoot: fixture.treeRoot };
      const targetless = await contextShowEntries({ ...base, targets: [] });
      expect(targetless[0]?.path).toBe(snapshot.product?.ref?.path);
      const targeted = await contextShowEntries({ ...base, targets: [target.id] });
      expect(entryPaths(targeted)).toContain(target.ref?.path);
      const foundation = await contextShowEntries({
        ...base,
        targets: [target.id],
        methodology: true,
        codingAgent: fixture.codingAgent,
        loadedProduct: true,
      });
      expect(foundation[0]?.path).toBe(fixture.documentPath);
      expect(await contextShowEntries({ ...base, targets: [target.id], loadedTargets: [target.id] })).toEqual([]);
      expect(entryPaths(await contextShowEntries({ ...base, targets: [target.id], loadedMethodology: true })))
        .toContain(
          target.ref?.path,
        );
      const exclusive = await contextShowFailure({
        ...base,
        targets: [target.id],
        methodology: true,
        loadedMethodology: true,
      });
      expect(exclusive).toContain(SPEC_DOMAIN_CLI.METHODOLOGY_OPTION);
      expect(exclusive).toContain(SPEC_DOMAIN_CLI.LOADED_METHODOLOGY_OPTION);
    });
  });

  it("changes only the representation between the text and JSON forms of show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.targetId], cwd: env.productDir };
      const entries = await contextShowEntries(options);
      const json = JSON.parse(await contextShowJson(options)) as { readonly entries: readonly unknown[] };
      expect(json.entries).toEqual(entries);
      const text = await contextShowText(options);
      for (const path of entryPaths(entries)) {
        expect(text).toContain(path);
      }
    });
  });
});
