import { describe, expect, it } from "vitest";

import { parseSpecContextManifestJson, renderSpecContextText } from "@/commands/spec/context";
import { parseSpecContextEntriesJson } from "@/commands/spec/context-show";
import { inferInvokingCodingAgent } from "@/interfaces/cli/coding-agent";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";
import { renderSpecContextEntries, SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import { methodologyFoundationDocumentPath } from "@testing/generators/methodology/tree";
import { RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE } from "@testing/generators/spec-tree/spec-cli";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListManifest,
  contextShowEntries,
  entryPaths,
  methodologyTreeConfig,
  runSpecDescriptor,
  specContextShowOptionFlags,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

const LIST = [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.CONTEXT_COMMAND, SPEC_DOMAIN_CLI.CONTEXT_LIST_COMMAND] as const;
const SHOW = [SPEC_DOMAIN_CLI.COMMAND, SPEC_DOMAIN_CLI.CONTEXT_COMMAND, SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND] as const;

describe("spec context command handlers", () => {
  it("emits the context library's versioned manifest from list for one or more accepted targets", async () => {
    await withRichContextEnv(async (env, paths) => {
      const run = await runSpecDescriptor(
        { productDir: env.productDir },
        ...LIST,
        paths.rootDirectory,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(run.exitCode, run.stderr).toBeUndefined();
      const manifest = parseSpecContextManifestJson(run.stdout);
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest).toEqual(
        await contextListManifest({ targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir }),
      );
      expect(manifest.targets).toHaveLength(2);
    });
  });

  it("emits the targetless or targeted projection from show, and --methodology with --coding-agent prepends the named agent's foundation", async () => {
    await withSpecTreeEnv(methodologyTreeConfig(), async (env) => {
      await env.materialize();
      // Every shipped agent's tree carries its own core text; the named agent
      // is one the invoking environment's markers would not select, so the
      // served core can only come from the option.
      const fixture = await writeMethodologyTree(env, { codingAgents: [...METHODOLOGY_CODING_AGENTS] });
      const inferred = inferInvokingCodingAgent(process.env);
      const named = METHODOLOGY_CODING_AGENTS.find((agent) => agent !== inferred) ?? fixture.codingAgent;
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const context = { productDir: env.productDir, methodologyTreeRoot: fixture.treeRoot };

      const targetless = await runSpecDescriptor(context, ...SHOW, SPEC_DOMAIN_CLI.JSON_OPTION);
      expect(targetless.exitCode, targetless.stderr).toBeUndefined();
      expect(parseSpecContextEntriesJson(targetless.stdout)[0]?.path).toBe(snapshot.product?.ref?.path);

      const targeted = await runSpecDescriptor(context, ...SHOW, target.id, SPEC_DOMAIN_CLI.JSON_OPTION);
      const targetedPaths = entryPaths(parseSpecContextEntriesJson(targeted.stdout));
      expect(targetedPaths).toContain(target.ref?.path);

      const foundation = await runSpecDescriptor(
        context,
        ...SHOW,
        target.id,
        SPEC_DOMAIN_CLI.JSON_OPTION,
        SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
        SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
        named,
      );
      expect(foundation.exitCode, foundation.stderr).toBeUndefined();
      const entries = parseSpecContextEntriesJson(foundation.stdout);
      expect(entries[0]).toMatchObject({
        path: methodologyFoundationDocumentPath({ ...fixture, codingAgent: named }),
        content: fixture.coreTexts[named],
      });
      expect(entryPaths(entries).slice(1)).toEqual(targetedPaths);
    });
  });

  it("changes only the representation between the text and JSON forms of list and show, and exposes no content option", async () => {
    await withRichContextEnv(async (env, paths) => {
      const context = { productDir: env.productDir };
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const showJson = await runSpecDescriptor(context, ...SHOW, paths.targetId, SPEC_DOMAIN_CLI.JSON_OPTION);
      const showText = await runSpecDescriptor(context, ...SHOW, paths.targetId);
      expect(parseSpecContextEntriesJson(showJson.stdout)).toEqual(entries);
      expect(showText.stdout).toBe(renderSpecContextEntries(entries));

      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const listJson = await runSpecDescriptor(context, ...LIST, paths.targetId, SPEC_DOMAIN_CLI.JSON_OPTION);
      const listText = await runSpecDescriptor(context, ...LIST, paths.targetId);
      expect(parseSpecContextManifestJson(listJson.stdout)).toEqual(manifest);
      expect(listText.stdout).toBe(`${String(renderSpecContextText(manifest))}\n`);

      // `show` declares no content option, so the descriptor refuses it before
      // any handler writes.
      expect(specContextShowOptionFlags()).not.toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option);
      const refused = await runSpecDescriptor(
        context,
        ...SHOW,
        paths.targetId,
        RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option,
      );
      expect(refused.parseError).toBeDefined();
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain(RETIRED_SPEC_CONTEXT_CONTENT_FIXTURE.option);
    });
  });
});
