import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_COMMAND_PATH } from "@/interfaces/cli/spec";
import { runSpecCli, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spx spec context exit status through the packaged executable", () => {
  it("maps a valid list or show projection to exit status zero with output", async () => {
    await withRichContextEnv(async (env, paths) => {
      for (const command of [SPEC_CONTEXT_COMMAND_PATH.LIST, SPEC_CONTEXT_COMMAND_PATH.SHOW]) {
        const run = await runSpecCli(env.productDir, ...command, paths.targetId);
        expect(run.exitCode, `${command.join(" ")}: ${run.stderr}`).toBe(0);
        expect(run.stdout.length, command.join(" ")).toBeGreaterThan(0);
      }
    });
  });
});
