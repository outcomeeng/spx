import { describe, expect, it } from "vitest";

import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { SPEC_CONTEXT_ENTRY_TYPE, SPEC_CONTEXT_FRAME } from "@/lib/spec-tree";
import { specCliContextTargetFixture } from "@testing/generators/spec-tree/spec-cli";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextShowEntries,
  documentPaths,
  parseContextEntries,
  runSpecCli,
  specTreeKindsConfig,
} from "@testing/harnesses/spec/context";

describe("spx spec context show process contract", () => {
  it("renders targetless discovery through the packaged executable in JSON and text", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const json = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(json.exitCode, json.stderr).toBe(0);
      const entries = parseContextEntries(json.stdout);
      expect(entries[0]?.path).toBe(snapshot.product?.ref?.path);
      expect(entries).toEqual(await contextShowEntries({ targets: [], cwd: env.productDir }));
      const text = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
      );
      expect(text.exitCode, text.stderr).toBe(0);
      expect(text.stdout.startsWith(`<${SPEC_CONTEXT_FRAME.DOCUMENT}`)).toBe(true);
      for (const entry of entries) {
        expect(text.stdout).toContain(entry.path);
        if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT) expect(text.stdout).toContain(entry.content);
      }
    });
  });

  it("renders targeted context for a suffix operand with a trailing separator in JSON and text", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
      const fixture = specCliContextTargetFixture(snapshot, target);
      const json = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        fixture.invocationTarget,
        SPEC_DOMAIN_CLI.JSON_OPTION,
      );
      expect(json.exitCode, json.stderr).toBe(0);
      const entries = parseContextEntries(json.stdout);
      expect(documentPaths(entries)).toContain(target.ref?.path);
      expect(entries).toEqual(await contextShowEntries({ targets: [fixture.expectedTarget], cwd: env.productDir }));
      const text = await runSpecCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
        SPEC_DOMAIN_CLI.CONTEXT_SHOW_COMMAND,
        fixture.invocationTarget,
      );
      expect(text.exitCode, text.stderr).toBe(0);
      for (const entry of entries) {
        expect(text.stdout).toContain(entry.path);
        if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT) expect(text.stdout).toContain(entry.content);
      }
    });
  });
});
