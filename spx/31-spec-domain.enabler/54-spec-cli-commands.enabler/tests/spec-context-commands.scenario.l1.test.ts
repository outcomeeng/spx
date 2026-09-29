import { describe, expect, it } from "vitest";

import { parseSpecContextManifestJson } from "@/commands/spec/context";
import { parseSpecContextEntriesJson } from "@/commands/spec/context-show";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import { RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE } from "@testing/generators/spec-tree/spec-cli";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListJson,
  contextListManifest,
  contextListText,
  contextShowEntries,
  contextShowJson,
  contextShowText,
  entryPaths,
  methodologyTreeConfig,
  specCliParseDiagnostic,
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

  it("emits the targetless or targeted projection from show and accepts --methodology and --coding-agent", async () => {
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
      });
      expect(foundation[0]?.path).toBe(fixture.documentPath);
      expect(entryPaths(foundation).slice(1)).toEqual(entryPaths(targeted));
    });
  });

  it("changes only the representation between the text and JSON forms of list and show, and exposes no content option", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = { targets: [paths.targetId], cwd: env.productDir };
      const entries = await contextShowEntries(options);
      expect(parseSpecContextEntriesJson(await contextShowJson(options))).toEqual(entries);
      const text = await contextShowText(options);
      for (const path of entryPaths(entries)) {
        expect(text).toContain(path);
      }
      const manifest = await contextListManifest(options);
      expect(parseSpecContextManifestJson(await contextListJson(options))).toEqual(manifest);
      const listText = await contextListText(options);
      for (const target of manifest.targets) {
        expect(listText).toContain(target);
      }
      const refused = await specCliParseDiagnostic(
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        paths.targetId,
        RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option,
      );
      expect(refused).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.unknownOptionPrefix);
      expect(refused).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option);
    });
  });
});
