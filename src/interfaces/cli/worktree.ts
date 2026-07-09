/**
 * Worktree CLI — Commander registration descriptor for the `spx worktree`
 * occupancy subcommands (claim, status, release).
 */
import { randomBytes as nodeRandomBytes } from "node:crypto";

import type { Command } from "commander";

import { claimCommand, releaseCommand, statusCommand, WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import type { Domain } from "@/domains/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { defaultGitDependencies } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { defaultProcessTable } from "@/lib/worktree-process-table";

/** Source-owned `spx worktree` command and flag vocabulary, shared with the CLI tests. */
export const WORKTREE_CLI = {
  COMMAND: "worktree",
  CLAIM: "claim",
  STATUS: "status",
  RELEASE: "release",
  WORKTREE_ARGUMENT: "[worktrees...]",
  SESSION_ID_FLAG: "--session-id",
  ALL_FLAG: "--all",
  FORMAT_FLAG: "--format",
  WORKTREES_DIR_FLAG: "--worktrees-dir",
} as const;

const WORKTREE_DOMAIN_DESCRIPTION = "Coordinate worktree occupancy across a bare-repository pool";

function writeOutput(invocation: CliInvocation, output: string): void {
  invocation.io.writeStdout(`${output}\n`);
}

function writeError(invocation: CliInvocation, output: string): void {
  invocation.io.writeStderr(`${output}\n`);
}

function writeInvocationWarning(invocation: CliInvocation, warning: string | undefined): void {
  if (warning !== undefined) {
    writeError(invocation, warning);
  }
}

function handleError(invocation: CliInvocation, error: string): never {
  writeError(invocation, `Error: ${error}`);
  return invocation.io.exit(1);
}

function registerWorktreeCommands(worktreeCmd: Command, invocation: CliInvocation): void {
  const effectiveInvocationDir = (): string => invocation.resolveEffectiveInvocationDir();

  worktreeCmd
    .command(WORKTREE_CLI.CLAIM)
    .description("Record a worktree-occupancy claim for the running worktree")
    .requiredOption(`${WORKTREE_CLI.SESSION_ID_FLAG} <id>`, "Claiming agent session id")
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (options: { sessionId: string; worktreesDir?: string }) => {
      const result = await claimCommand({
        cwd: effectiveInvocationDir(),
        env: process.env,
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        processTable: defaultProcessTable,
        claimRandomBytes: nodeRandomBytes,
        selfPid: process.pid,
        sessionId: options.sessionId,
        worktreesDir: options.worktreesDir,
        onWarning: (warning) => writeInvocationWarning(invocation, warning),
      });
      if (!result.ok) handleError(invocation, result.error);
      // A successful claim writes nothing to stdout so command callers can use it
      // from hook flows without adding model-visible context.
    });

  worktreeCmd
    .command(`${WORKTREE_CLI.STATUS} ${WORKTREE_CLI.WORKTREE_ARGUMENT}`)
    .description("Report a worktree's occupancy (running | free)")
    .option(WORKTREE_CLI.ALL_FLAG, "Report every git-observed worktree")
    .option(`${WORKTREE_CLI.FORMAT_FLAG} <format>`, "Output format (text|json)", WORKTREE_STATUS_FORMAT.TEXT)
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(
      async (worktrees: string[] | undefined, options: { all?: boolean; format?: string; worktreesDir?: string }) => {
        const result = await statusCommand({
          cwd: effectiveInvocationDir(),
          fs: defaultOccupancyFileSystem,
          gitDeps: defaultGitDependencies,
          worktrees,
          all: options.all,
          format: options.format,
          pathInfo: defaultWorktreePathInfo,
          processTable: defaultProcessTable,
          worktreesDir: options.worktreesDir,
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        if (!result.ok) handleError(invocation, result.error);
        writeOutput(invocation, result.value);
      },
    );

  worktreeCmd
    .command(WORKTREE_CLI.RELEASE)
    .description("Release the running worktree's occupancy claim")
    .option(`${WORKTREE_CLI.SESSION_ID_FLAG} <id>`, "Releasing agent session id")
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (options: { sessionId?: string; worktreesDir?: string }) => {
      const result = await releaseCommand({
        cwd: effectiveInvocationDir(),
        env: process.env,
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        processTable: defaultProcessTable,
        selfPid: process.pid,
        sessionId: options.sessionId,
        worktreesDir: options.worktreesDir,
        onWarning: (warning) => writeInvocationWarning(invocation, warning),
      });
      if (!result.ok) handleError(invocation, result.error);
    });
}

/**
 * Worktree CLI — Commander registration descriptor for the worktree subcommands.
 */
export const worktreeDomain: Domain = {
  name: WORKTREE_CLI.COMMAND,
  description: WORKTREE_DOMAIN_DESCRIPTION,
  register: (program: Command, invocation: CliInvocation) => {
    const worktreeCmd = program
      .command(WORKTREE_CLI.COMMAND)
      .description(WORKTREE_DOMAIN_DESCRIPTION);

    registerWorktreeCommands(worktreeCmd, invocation);
  },
};
