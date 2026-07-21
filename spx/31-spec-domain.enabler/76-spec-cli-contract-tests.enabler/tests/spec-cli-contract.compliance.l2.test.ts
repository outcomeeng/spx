import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { isWithinProductDirectory, runSpecCliWithIsolation } from "@testing/harnesses/spec/context";

describe("spx spec process isolation", () => {
  it("invokes the packaged executable with zero outbound network attempts", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
        OUTPUT_FORMAT.JSON,
      );
      expect(execution.result.exitCode).toBe(0);
      expect(execution.networkAttempts).toEqual([]);
      expect(() => JSON.parse(execution.result.stdout)).not.toThrow();
    });
  });

  it("confines mutable process state to the temp product directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const execution = await runSpecCliWithIsolation(
        env.productDir,
        SPEC_DOMAIN_CLI.COMMAND,
        SPEC_DOMAIN_CLI.STATUS_COMMAND,
        SPEC_DOMAIN_CLI.FORMAT_OPTION_FLAG,
        OUTPUT_FORMAT.JSON,
      );
      expect(execution.result.exitCode, execution.result.stderr).toBe(0);
      expect(
        execution.mutableStateDirectories.every((path) => isWithinProductDirectory(execution.productDirectory, path)),
      )
        .toBe(true);
      expect(execution.writableDirectories.every((path) => path === execution.productDirectory))
        .toBe(true);
    });
  });
});
