import { describe, expect, it } from "vitest";

import { renderSpecContextText } from "@/commands/spec/context";
import { inferInvokingCodingAgent } from "@/interfaces/cli/coding-agent";
import { SPEC_CONTEXT_COMMAND_PATH, SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";
import {
  renderSpecContextEntries,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_SELECTION_REASON,
} from "@/lib/spec-tree";
import { methodologyFoundationDocumentPath } from "@testing/generators/methodology/tree";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListManifest,
  contextShowEntries,
  entryPaths,
  manifestEntryAt,
  methodologyTreeConfig,
  parseContextEntries,
  parseContextManifest,
  runSpecDescriptor,
  withRichContextEnv,
  writeMethodologyTree,
} from "@testing/harnesses/spec/context";

describe("spec context command handlers", () => {
  it("emits the context library's versioned manifest from list for one or more accepted targets", async () => {
    await withRichContextEnv(async (env, paths) => {
      const run = await runSpecDescriptor(
        { productDir: env.productDir },
        ...SPEC_CONTEXT_COMMAND_PATH.LIST,
        paths.rootDirectory,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(run.exitCode, run.stderr).toBeUndefined();
      const manifest = parseContextManifest(run.stdout);
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest).toEqual(
        await contextListManifest({ targets: [paths.rootDirectory, paths.targetId], cwd: env.productDir }),
      );
      // Each requested target selects its own spec as the target, so the
      // manifest is the one for both accepted targets, not for either alone.
      expect(manifestEntryAt(manifest, paths.rootSpecPath)?.selections).toContainEqual({
        target: rootedSpecPath(paths.rootDirectory),
        reason: SPEC_CONTEXT_SELECTION_REASON.TARGET,
      });
      expect(manifestEntryAt(manifest, paths.targetSpecPath)?.selections).toContainEqual({
        target: rootedSpecPath(paths.targetId),
        reason: SPEC_CONTEXT_SELECTION_REASON.TARGET,
      });
    });
  });

  it("emits the context library's targetless or targeted document projection from show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const context = { productDir: env.productDir };

      const targetless = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(targetless.exitCode, targetless.stderr).toBeUndefined();
      const targetlessEntries = parseContextEntries(targetless.stdout);
      expect(targetlessEntries).toEqual(await contextShowEntries({ targets: [], cwd: env.productDir }));
      expect(targetlessEntries[0]?.path).toBe(paths.productPath);

      const targeted = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(targeted.exitCode, targeted.stderr).toBeUndefined();
      const targetedEntries = parseContextEntries(targeted.stdout);
      expect(targetedEntries).toEqual(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir }));
      expect(entryPaths(targetedEntries)).toContain(paths.targetSpecPath);
    });
  });

  it("accepts --methodology and --coding-agent <name> on show, prepending the named agent's foundation", async () => {
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

      const targeted = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        target.id,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      const targetedPaths = entryPaths(parseContextEntries(targeted.stdout));

      const foundation = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        target.id,
        SPEC_DOMAIN_CLI.JSON_OPTION,
        SPEC_DOMAIN_CLI.METHODOLOGY_OPTION,
        SPEC_DOMAIN_CLI.CODING_AGENT_OPTION,
        named,
      );
      expect(foundation.exitCode, foundation.stderr).toBeUndefined();
      expect(foundation.parseError).toBeUndefined();
      const entries = parseContextEntries(foundation.stdout);
      expect(entries[0]).toMatchObject({
        path: methodologyFoundationDocumentPath({ ...fixture, codingAgent: named }),
        content: fixture.coreTexts[named],
      });
      expect(entryPaths(entries).slice(1)).toEqual(targetedPaths);
    });
  });

  it("changes only the representation between the text and JSON forms of list and show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const context = { productDir: env.productDir };
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const showJson = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.SHOW,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      const showText = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.SHOW, paths.targetId);
      expect(parseContextEntries(showJson.stdout)).toEqual(entries);
      expect(showText.stdout).toBe(renderSpecContextEntries(entries));

      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const listJson = await runSpecDescriptor(
        context,
        ...SPEC_CONTEXT_COMMAND_PATH.LIST,
        paths.targetId,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      const listText = await runSpecDescriptor(context, ...SPEC_CONTEXT_COMMAND_PATH.LIST, paths.targetId);
      expect(parseContextManifest(listJson.stdout)).toEqual(manifest);
      expect(listText.stdout).toBe(`${String(renderSpecContextText(manifest))}\n`);
    });
  });
});
