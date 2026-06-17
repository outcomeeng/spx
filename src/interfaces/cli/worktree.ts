/**
 * Worktree CLI — Commander registration descriptor for the `spx worktree`
 * occupancy subcommands (claim, status, release).
 */
import type { Command } from "commander";

import {
  claimCommand,
  releaseCommand,
  sessionStartCommand,
  statusCommand,
  WORKTREE_STATUS_FORMAT,
} from "@/commands/worktree/index";
import type { Domain } from "@/domains/types";

import { writeWarning } from "./write-warning";

/** Source-owned `spx worktree` command and flag vocabulary, shared with the CLI tests. */
export const WORKTREE_CLI = {
  COMMAND: "worktree",
  CLAIM: "claim",
  SESSION_START: "session-start",
  STATUS: "status",
  RELEASE: "release",
  ENV_FILE_FLAG: "--env-file",
  WORKTREE_ARGUMENT: "[worktrees...]",
  SESSION_ID_FLAG: "--session-id",
  FORMAT_FLAG: "--format",
  WORKTREES_DIR_FLAG: "--worktrees-dir",
} as const;

const WORKTREE_DOMAIN_DESCRIPTION = "Coordinate worktree occupancy across a bare-repository pool";

function handleError(error: string): never {
  console.error("Error:", error);
  process.exit(1);
}

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;

  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data.length === 0 ? undefined : data);
    });
    process.stdin.on("error", () => {
      resolve(undefined);
    });
  });
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
    .action(async (worktrees: string[] | undefined, options: { format?: string; worktreesDir?: string }) => {
      const result = await statusCommand({
        worktrees,
        format: options.format,
        worktreesDir: options.worktreesDir,
        onWarning: writeWarning,
      });
      if (!result.ok) handleError(result.error);
      console.log(result.value);
    });

  worktreeCmd
    .command(WORKTREE_CLI.SESSION_START)
    .description("Claim the running worktree from a SessionStart hook payload")
    .option(`${WORKTREE_CLI.ENV_FILE_FLAG} <path>`, "Hook env file to append; defaults to $CLAUDE_ENV_FILE")
    .option(`${WORKTREE_CLI.WORKTREES_DIR_FLAG} <path>`, "Explicit .spx/worktrees directory")
    .action(async (options: { envFile?: string; worktreesDir?: string }) => {
      const content = await readStdin();
      const result = await sessionStartCommand({
        content,
        envFile: options.envFile,
        worktreesDir: options.worktreesDir,
        onWarning: writeWarning,
      });
      if (!result.ok) handleError(result.error);
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
