import { describe, expect, it } from "vitest";

import { AGENT_RESUME_TEXT } from "@/domains/agent/protocol";
import { resolveProductDir } from "@/domains/config/root";
import { AGENT_CLI } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { arbitraryAgentWorktreeRoot, sampleAgentResumeValue } from "@testing/generators/agent/resume";
import { createNonInteractiveResumeProgram, ImmediateExit } from "@testing/harnesses/agent/resume";

describe("agent resume non-interactive compliance", () => {
  it("refuses the default interactive picker without writing stdout", async () => {
    const productDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const warning = resolveProductDir(productDir).warning;
    if (warning === undefined) {
      throw new Error("agent resume non-interactive fixture must be outside a git worktree");
    }
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    const program = createNonInteractiveResumeProgram({
      productDir,
      writeStdout: (output) => stdout.push(output),
      writeStderr: (output) => stderr.push(output),
      exit: (exitCode) => {
        exitCodes.push(exitCode);
        throw new ImmediateExit(exitCode);
      },
    });
    program.exitOverride();

    await expect(
      program.parseAsync([AGENT_CLI.commandName, AGENT_CLI.resumeCommandName], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toBeInstanceOf(ImmediateExit);

    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain(warning);
    expect(stderr.join("")).toContain(AGENT_RESUME_TEXT.INTERACTIVE_REQUIRED);
    expect(exitCodes.every((exitCode) => exitCode > 0)).toBe(true);
  });
});
