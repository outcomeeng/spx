/**
 * Hook CLI — Commander registration descriptor for `spx hook run <event>`.
 *
 * @module interfaces/cli/hook
 */

import type { Command } from "commander";

import type { Domain } from "@/domains/types";
import { defaultGitDependencies } from "@/git/root";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { processHookIo, runHookCli } from "@/interfaces/hooks/cli-runner";
import { createClaimWriteToken } from "@/lib/worktree-claim-write-token";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";

import { writeWarning } from "./write-warning";

/** Source-owned `spx hook` command and flag vocabulary, shared with CLI tests. */
export const HOOK_CLI = {
  COMMAND: "hook",
  RUN: "run",
  EVENT_ARGUMENT: "<event>",
  ENV_FILE_FLAG: "--hook-env-file",
  WORKTREES_DIR_FLAG: "--worktrees-dir",
} as const;

const HOOK_DOMAIN_DESCRIPTION = "Run host lifecycle hook events";

function registerHookCommands(hookCmd: Command, invocation: CliInvocation): void {
  const effectiveInvocationDir = (): string => invocation.resolveEffectiveInvocationDir();

  hookCmd
    .command(`${HOOK_CLI.RUN} ${HOOK_CLI.EVENT_ARGUMENT}`)
    .description("Run a hook lifecycle event")
    .option(`${HOOK_CLI.ENV_FILE_FLAG} <path>`, "Hook env file to append; defaults to $CLAUDE_ENV_FILE")
    .option(`${HOOK_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (event: string, options: { hookEnvFile?: string; worktreesDir?: string }) => {
      const result = await runHookCli({
        claimWriteToken: createClaimWriteToken(),
        cwd: effectiveInvocationDir(),
        env: process.env,
        envFile: options.hookEnvFile,
        event,
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        io: processHookIo,
        onWarning: writeWarning,
        processTable: defaultProcessTable,
        selfPid: process.pid,
        worktreesDir: options.worktreesDir,
      });
      if (!result.ok) process.exit(1);
    });
}

/** Hook CLI — Commander registration descriptor for hook events. */
export const hookDomain: Domain = {
  name: HOOK_CLI.COMMAND,
  description: HOOK_DOMAIN_DESCRIPTION,
  register: (program: Command, invocation: CliInvocation) => {
    const hookCmd = program.command(HOOK_CLI.COMMAND).description(HOOK_DOMAIN_DESCRIPTION);

    registerHookCommands(hookCmd, invocation);
  },
};
