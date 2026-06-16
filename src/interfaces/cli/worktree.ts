/**
 * Worktree CLI — Commander registration descriptor for the `spx worktree`
 * occupancy subcommands (claim, status, release).
 */
import type { Command } from "commander";

import { claimCommand, releaseCommand, statusCommand, WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import type { Domain } from "@/domains/types";

import { writeWarning } from "./write-warning";

/** Source-owned `spx worktree` command and flag vocabulary, shared with the CLI tests. */
export const WORKTREE_CLI = {
  COMMAND: "worktree",
  CLAIM: "claim",
  STATUS: "status",
  RELEASE: "release",
  WORKTREE_ARGUMENT: "[worktree]",
  SESSION_ID_FLAG: "--session-id",
  FORMAT_FLAG: "--format",
  WORKTREES_DIR_FLAG: "--worktrees-dir",
} as const;

const WORKTREE_DOMAIN_DESCRIPTION = "Coordinate worktree occupancy across a bare-repository pool";

function handleError(error: string): never {
  console.error("Error:", error);
  process.exit(1);
}

function registerWorktreeCommands(worktreeCmd: Command): void {
  worktreeCmd
    .command(WORKTREE_CLI.CLAIM)
    .description("Record a worktree-occupancy claim for the running worktree")
    .requiredOption(`${WORKTREE_CLI.SESSION_ID_FLAG} <id>`, "Claiming agent session id")
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (options: { sessionId: string; worktreesDir?: string }) => {
      const result = await claimCommand({
        sessionId: options.sessionId,
        worktreesDir: options.worktreesDir,
        onWarning: writeWarning,
      });
      if (!result.ok) handleError(result.error);
      // A successful claim writes nothing to stdout — the SessionStart hook
      // injects a command's stdout into the agent's context.
    });

  worktreeCmd
    .command(`${WORKTREE_CLI.STATUS} ${WORKTREE_CLI.WORKTREE_ARGUMENT}`)
    .description("Report a worktree's occupancy (occupied | unclaimed | stale)")
    .option(`${WORKTREE_CLI.FORMAT_FLAG} <format>`, "Output format (text|json)", WORKTREE_STATUS_FORMAT.TEXT)
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (worktree: string | undefined, options: { format?: string; worktreesDir?: string }) => {
      const result = await statusCommand({
        worktree,
        format: options.format,
        worktreesDir: options.worktreesDir,
        onWarning: writeWarning,
      });
      if (!result.ok) handleError(result.error);
      console.log(result.value);
    });

  worktreeCmd
    .command(WORKTREE_CLI.RELEASE)
    .description("Release the running worktree's occupancy claim")
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (options: { worktreesDir?: string }) => {
      const result = await releaseCommand({ worktreesDir: options.worktreesDir, onWarning: writeWarning });
      if (!result.ok) handleError(result.error);
    });
}

/**
 * Worktree CLI — Commander registration descriptor for the worktree subcommands.
 */
export const worktreeDomain: Domain = {
  name: WORKTREE_CLI.COMMAND,
  description: WORKTREE_DOMAIN_DESCRIPTION,
  register: (program: Command) => {
    const worktreeCmd = program
      .command(WORKTREE_CLI.COMMAND)
      .description(WORKTREE_DOMAIN_DESCRIPTION);

    registerWorktreeCommands(worktreeCmd);
  },
};
