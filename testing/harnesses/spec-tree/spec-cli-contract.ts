import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_DOCUMENT_ROLE } from "@/commands/spec/context";
import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { SPEC_DOMAIN_CLI, SPEC_STATUS_FORMAT_MESSAGE } from "@/interfaces/cli/spec";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { RETIRED_SPEC_APPLY_FIXTURE, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

export function registerSpecCliContractScenarioEvidence(): void {
  describe("spx spec process contract", () => {
    it("routes status through the development CLI entry point", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();

        const { stdout, exitCode } = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.STATUS_COMMAND,
        );

        expect(exitCode).toBe(0);
        expect(stdout).toContain(env.fixture.root.slug);
        expect(stdout).toContain(SPEC_TREE_NODE_STATE.DECLARED);
      });
    });

    it("accepts the status --update flag through the development CLI entry point", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();

        // The fixture nodes carry no co-located tests, so every node is `declared`
        // and --update composes the production resolver but invokes no per-node run.
        const { stdout, stderr, exitCode } = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.STATUS_COMMAND,
          SPEC_DOMAIN_CLI.UPDATE_OPTION,
        );

        expect(exitCode, stderr).toBe(0);
        expect(stdout).toContain(env.fixture.root.slug);
        expect(stdout).toContain(SPEC_TREE_NODE_STATE.DECLARED);
      });
    });

    it("routes next through the development CLI entry point", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();

        const { stdout, exitCode } = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.NEXT_COMMAND,
        );

        expect(exitCode).toBe(0);
        expect(stdout).toContain(SPEC_NEXT_MESSAGE.HEADING);
        expect(stdout).toContain(env.fixture.root.slug);
      });
    });

    it("routes context through the development CLI entry point", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();
        const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);

        const { stdout, exitCode } = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.CONTEXT_COMMAND,
          target,
          SPEC_DOMAIN_CLI.JSON_OPTION,
        );

        const manifest = JSON.parse(stdout) as {
          readonly target: string;
          readonly documents: readonly { readonly role: string }[];
        };
        expect(exitCode).toBe(0);
        expect(manifest.target).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${target}`);
        expect(manifest.documents.some((document) => document.role === SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT)).toBe(true);
      });
    });

    it("rejects an unsupported status output format", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();

        const result = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.STATUS_COMMAND,
          SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
          "unsupported-format",
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(SPEC_STATUS_FORMAT_MESSAGE.INVALID_PREFIX);
      });
    });

    it("accepts local status format flags without network or shared state", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();

        const { stdout, exitCode } = await runCli(
          env.productDir,
          SPEC_DOMAIN_CLI.COMMAND,
          SPEC_DOMAIN_CLI.STATUS_COMMAND,
          SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
          OUTPUT_FORMAT.JSON,
        );

        expect(exitCode).toBe(0);
        expect(() => JSON.parse(stdout)).not.toThrow();
      });
    });
  });
}

export function registerSpecCliContractComplianceEvidence(): void {
  describe("spx spec process compliance", () => {
    it("rejects config-writing apply routing without modifying product configuration", async () => {
      await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
        await env.materialize();
        const nodePath = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, env.fixture.root);
        const pyprojectContent = `[${RETIRED_SPEC_APPLY_FIXTURE.pytestSection}]\naddopts = ""\n`;
        await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.excludeFile, `${nodePath}\n`);
        await env.writeRaw(RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile, pyprojectContent);

        const result = await runCli(env.productDir, SPEC_DOMAIN_CLI.COMMAND, RETIRED_SPEC_APPLY_FIXTURE.command);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.unknownCommandPrefix);
        expect(result.stderr).toContain(RETIRED_SPEC_APPLY_FIXTURE.command);
        expect(await env.readFile(RETIRED_SPEC_APPLY_FIXTURE.pythonConfigFile)).toBe(pyprojectContent);
      });
    });
  });
}

async function runCli(cwd: string, ...args: readonly string[]) {
  return execa(NODE_EXECUTABLE, [CLI_PATH, ...args], { cwd, reject: false });
}
