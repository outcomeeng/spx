import { describe, expect, it } from "vitest";

import { AGENT_RESUME_TEXT } from "@/domains/agent/protocol";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { arbitraryAgentWorktreeRoot, sampleAgentResumeValue } from "@testing/generators/agent/resume";
import { ImmediateExit } from "@testing/harnesses/agent/resume";

describe("agent resume non-interactive compliance", () => {
  it("refuses the default interactive picker without writing stdout", async () => {
    const productDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCodes: number[] = [];
    const program = createCliProgram({
      domains: [
        createAgentDomain({
          isInteractiveTerminal: () => false,
          resumeDeps: {
            fs: {
              readDir: async () => {
                throw new Error("discovery should not run for non-interactive refusal");
              },
              readFile: async () => {
                throw new Error("discovery should not run for non-interactive refusal");
              },
              stat: async () => {
                throw new Error("discovery should not run for non-interactive refusal");
              },
            },
            homeDir: () => productDir,
            nowMs: () => Date.now(),
            resolveWorktreeRoot: async () => productDir,
          },
        }),
      ],
      processCwd: () => productDir,
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
    expect(stderr.join("")).toContain(AGENT_RESUME_TEXT.INTERACTIVE_REQUIRED);
    expect(exitCodes.every((exitCode) => exitCode > 0)).toBe(true);
  });
});
