/**
 * Worktree command-output harness — runs `spx worktree status` against a worktree
 * git reports at a caller-chosen root, with a real claim store in a temporary
 * directory and a controlled process table reporting the claim's holder alive.
 *
 * The root never exists on disk: a caller drives paths carrying bytes a terminal
 * reads as commands, which no test should create in a real pool. The claim store
 * is real, so the report is assembled from a claim the occupancy store actually
 * wrote and read back.
 *
 * @module testing/harnesses/worktree/command-output
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";

import { statusCommand, type WorktreeStatusError } from "@/commands/worktree/index";
import type { Result } from "@/config/types";
import { type OccupancyFileSystem, type WorktreeClaimRecord, writeClaim } from "@/domains/worktree/occupancy-store";
import type { WorktreePathInfo } from "@/domains/worktree/resolve";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import type { TerminalText } from "@/lib/terminal-text/terminal-text";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import {
  createProcessTable,
  poolWorktreeGitDependencies,
  type ProcessTableEntry,
} from "@testing/harnesses/worktree/harness";

const STATUS_WORKTREES_PREFIX = "spx-worktree-output-worktrees-";
const STATUS_COMMON_DIR_PREFIX = "spx-worktree-output-common-";

/** The status outcome a harness invocation produced, for the linked test to judge. */
export type WorktreeStatusOutcome = Result<TerminalText, WorktreeStatusError>;

/** No status target under test exists on disk, so the path probe reports every target absent. */
const absentPathInfo: WorktreePathInfo = {
  isExistingNonDirectory: async () => false,
};

/** A refusal is decided during resolution, so status never consults the process table. */
const UNCONSULTED_HOST = "";

export interface WorktreeStatusReportRequest {
  /** The worktree root git reports for the running directory. */
  readonly worktreeRoot: string;
  /** The claim written into the store before status runs. */
  readonly claim: WorktreeClaimRecord;
  /** The holder process's command, as the process table reports it. */
  readonly holderCommand: string;
  /** The `--format` value; omitted selects the text report. */
  readonly format?: string;
}

/**
 * Writes `claim` for the worktree at `worktreeRoot` into a temporary claim store,
 * runs `spx worktree status` against that worktree with its holder reported
 * alive, and hands the outcome to `callback`. The store is removed on both the
 * return and the throw path.
 */
export async function withWorktreeStatusReport(
  request: WorktreeStatusReportRequest,
  callback: (status: WorktreeStatusOutcome) => void,
): Promise<void> {
  await withTempDir(STATUS_WORKTREES_PREFIX, async (worktreesDir) => {
    await withTempDir(STATUS_COMMON_DIR_PREFIX, async (commonDir) => {
      const fs: OccupancyFileSystem = defaultOccupancyFileSystem;
      const written = await writeClaim(worktreesDir, worktreeClaimName(request.worktreeRoot), request.claim, {
        fs,
        randomBytes: nodeRandomBytes,
      });
      if (!written.ok) throw new Error(`status-report harness could not write the claim: ${written.error}`);

      callback(
        await statusCommand({
          cwd: request.worktreeRoot,
          format: request.format,
          fs,
          gitDeps: poolWorktreeGitDependencies({ worktreeRoot: request.worktreeRoot, commonDir }),
          pathInfo: absentPathInfo,
          processTable: createProcessTable({
            host: request.claim.host,
            processes: new Map<number, ProcessTableEntry>([
              [request.claim.pid, {
                alive: true,
                startTime: request.claim.startedAt,
                command: request.holderCommand,
              }],
            ]),
          }),
          worktreesDir,
        }),
      );
    });
  });
}

export interface WorktreeStatusRefusalRequest {
  /** The worktree root git reports for the running directory. */
  readonly worktreeRoot: string;
  /** The status operand, denoting no worktree the runner reports. */
  readonly target: string;
}

/**
 * Runs `spx worktree status` against a target outside every worktree the git
 * runner reports, and returns the outcome. No claim is written and no store is
 * created: resolution refuses the target before any occupancy is read.
 */
export async function worktreeStatusRefusal(
  request: WorktreeStatusRefusalRequest,
): Promise<WorktreeStatusOutcome> {
  return withTempDir(STATUS_COMMON_DIR_PREFIX, async (gitStateDir) =>
    statusCommand({
      cwd: request.worktreeRoot,
      worktrees: [request.target],
      fs: defaultOccupancyFileSystem,
      gitDeps: poolWorktreeGitDependencies({ worktreeRoot: request.worktreeRoot, commonDir: gitStateDir }),
      pathInfo: absentPathInfo,
      processTable: createProcessTable({ host: UNCONSULTED_HOST, processes: new Map() }),
      worktreesDir: gitStateDir,
    }));
}
