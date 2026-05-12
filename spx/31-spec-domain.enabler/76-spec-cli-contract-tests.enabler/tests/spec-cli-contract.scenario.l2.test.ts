import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { SPEC_NEXT_MESSAGE } from "@/commands/spec/next";
import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { SPEC_DOMAIN_CLI, SPEC_STATUS_FORMAT_MESSAGE } from "@/domains/spec";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

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

  it("rejects an unsupported status output format", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();

      const result = await runCli(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION,
        "invalid",
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
        SPEC_DOMAIN_CLI.FORMAT_OPTION,
        OUTPUT_FORMAT.JSON,
      );

      expect(exitCode).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });
});

async function runCli(cwd: string, ...args: readonly string[]) {
  return execa(NODE_EXECUTABLE, [CLI_PATH, ...args], { cwd, reject: false });
}
