/**
 * Default diagnose check probes — the reading-gathering orchestration the
 * descriptor wires into the check registry. Each probe gathers its check's
 * reading by shelling out to git, the on-PATH `spx`, and the plugin CLIs, and
 * degrades to an errored reading on any failure so the pure classifier maps it
 * to an unknown verdict. This is the command-layer I/O orchestration of
 * `spx/54-diagnose.enabler/13-diagnose-engine.adr.md`: filesystem and subprocess
 * reads with no Commander binding and no process exit.
 *
 * @module commands/diagnose/probes
 */

import { execa } from "execa";

import type { MarketplaceInstallProbe, MarketplaceInstallReading } from "@/domains/diagnose/checks/marketplace-install";
import type { SessionEnvironmentProbe, SessionEnvironmentReading } from "@/domains/diagnose/checks/session-environment";
import type { SessionStoreProbe, SessionStoreReading } from "@/domains/diagnose/checks/session-store";
import type { WorktreePoolProbe, WorktreePoolReading } from "@/domains/diagnose/checks/worktree-pool";
import type { MarketplaceIdentity } from "@/domains/diagnose/manifest";
import { AGENT_SESSION_ENV } from "@/domains/session/agent-session";
import { classifyOccupancy, OCCUPANCY_STATUS, readClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import {
  detectGitCommonDirProductRoot,
  GIT_WORKTREE_PORCELAIN_BARE_LINE,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
} from "@/git/root";
import { findExecutableOnPath } from "@/lib/executable-on-path";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";

const GIT = "git";
const SPX = "spx";
const PORCELAIN_BLOCK_SEPARATOR = "\n\n";

interface Capture {
  readonly ok: boolean;
  readonly stdout: string;
}

async function runCapture(file: string, args: readonly string[]): Promise<Capture> {
  try {
    const result = await execa(file, args, { reject: false });
    return { ok: result.exitCode === 0, stdout: result.stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function resolveSpx(): string | null {
  return findExecutableOnPath(SPX);
}

/** The working-tree paths from `git worktree list --porcelain`, excluding the bare-repository entry. */
function worktreePaths(porcelain: string): readonly string[] {
  const paths: string[] = [];
  for (const block of porcelain.split(PORCELAIN_BLOCK_SEPARATOR)) {
    const lines = block.split("\n");
    const worktreeLine = lines.find((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX));
    if (worktreeLine === undefined) continue;
    if (lines.some((line) => line.trim() === GIT_WORKTREE_PORCELAIN_BARE_LINE)) continue;
    paths.push(worktreeLine.slice(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX.length).trim());
  }
  return paths;
}

/** Resolves the worktree layout from git plus the per-worktree `spx worktree status` occupancy. */
export const defaultWorktreePoolProbe: WorktreePoolProbe = {
  async probe(): Promise<WorktreePoolReading> {
    const errored: WorktreePoolReading = {
      errored: true,
      bareRepository: false,
      linkedWorktrees: false,
      staleClaim: false,
    };
    const bare = await runCapture(GIT, ["config", "--get", "core.bare"]);
    const list = await runCapture(GIT, ["worktree", "list", "--porcelain"]);
    if (!list.ok) return errored;

    const bareRepository = bare.stdout.trim() === "true";
    const paths = worktreePaths(list.stdout);
    const linkedWorktrees = !bareRepository && paths.length > 1;

    const spx = resolveSpx();
    let staleClaim = false;
    if (spx !== null) {
      for (const path of paths) {
        const status = await runCapture(spx, ["worktree", "status", path]);
        if (!status.ok) return errored;
        if (status.stdout.includes(OCCUPANCY_STATUS.STALE)) {
          staleClaim = true;
          break;
        }
      }
    }
    return { errored: false, bareRepository, linkedWorktrees, staleClaim };
  },
};

/** Resolves the session-environment reading from the agent-session env vars and the worktree-claim round-trip. */
export const defaultSessionEnvironmentProbe: SessionEnvironmentProbe = {
  async probe(): Promise<SessionEnvironmentReading> {
    const hookPresent = AGENT_SESSION_ENV.CLAUDE_SESSION_ID in process.env
      || AGENT_SESSION_ENV.CODEX_THREAD_ID in process.env;
    const sessionIdentity = (process.env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID] ?? "").length > 0
      || (process.env[AGENT_SESSION_ENV.CODEX_THREAD_ID] ?? "").length > 0;

    const spx = resolveSpx();
    if (spx === null) {
      return { errored: false, hookPresent, sessionIdentity, worktreeClaimed: false, roundTripStale: false };
    }
    const status = await runCapture(spx, ["worktree", "status"]);
    if (!status.ok) {
      return { errored: true, hookPresent, sessionIdentity, worktreeClaimed: false, roundTripStale: false };
    }
    return {
      errored: false,
      hookPresent,
      sessionIdentity,
      worktreeClaimed: status.stdout.includes(OCCUPANCY_STATUS.OCCUPIED),
      roundTripStale: status.stdout.includes(OCCUPANCY_STATUS.STALE),
    };
  },
};

interface DoingSession {
  readonly agent_session_id?: string;
}

async function claimedSessionIds(): Promise<ReadonlySet<string> | null> {
  const root = await detectGitCommonDirProductRoot();
  if (!root.isGitRepo) return null;
  const worktreesDir = worktreesScopeDir(root.productDir);
  const layout = await runCapture(GIT, ["worktree", "list", "--porcelain"]);
  if (!layout.ok) return null;

  const sessionIds = new Set<string>();
  for (const path of worktreePaths(layout.stdout)) {
    const claim = await readClaim(worktreesDir, worktreeClaimName(path), { fs: defaultOccupancyFileSystem });
    if (!claim.ok || claim.value === undefined) continue;
    // Only a live (occupied) claim backs a doing session; a stale claim leaves it orphaned.
    if (classifyOccupancy(claim.value, defaultProcessTable) === OCCUPANCY_STATUS.OCCUPIED) {
      sessionIds.add(claim.value.sessionId);
    }
  }
  return sessionIds;
}

/** Resolves the session-store reading from doing sessions joined to the worktree claims that back them. */
export const defaultSessionStoreProbe: SessionStoreProbe = {
  async probe(): Promise<SessionStoreReading> {
    const spx = resolveSpx();
    if (spx === null) return { errored: true, orphanedClaims: 0 };

    const list = await runCapture(spx, ["session", "list", "--status", "doing", "--json"]);
    const claimed = await claimedSessionIds();
    if (!list.ok || claimed === null) return { errored: true, orphanedClaims: 0 };

    let doing: readonly DoingSession[];
    try {
      const parsed = JSON.parse(list.stdout) as { doing?: readonly DoingSession[] };
      doing = parsed.doing ?? [];
    } catch {
      return { errored: true, orphanedClaims: 0 };
    }

    let orphanedClaims = 0;
    for (const session of doing) {
      const sessionId = session.agent_session_id;
      if (sessionId !== undefined && !claimed.has(sessionId)) orphanedClaims += 1;
    }
    return { errored: false, orphanedClaims };
  },
};

function pluginSurfacePresent(cli: string): boolean {
  return findExecutableOnPath(cli) !== null;
}

async function surfaceState(
  cli: string,
  marketplace: MarketplaceIdentity,
  expectedPlugins: readonly string[],
): Promise<{ ok: boolean; unregistered: boolean; drifted: boolean }> {
  const marketplaces = await runCapture(cli, ["plugin", "marketplace", "list"]);
  if (!marketplaces.ok) return { ok: false, unregistered: false, drifted: false };
  const registered = marketplaces.stdout.includes(marketplace.name) || marketplaces.stdout.includes(marketplace.source);
  if (!registered) return { ok: true, unregistered: true, drifted: false };

  const plugins = await runCapture(cli, ["plugin", "list"]);
  if (!plugins.ok) return { ok: false, unregistered: false, drifted: false };
  const drifted = expectedPlugins.some((plugin) => !plugins.stdout.includes(plugin));
  return { ok: true, unregistered: false, drifted };
}

/** Resolves the marketplace-install reading across the present Claude and Codex plugin CLI surfaces. */
export const defaultMarketplaceInstallProbe: MarketplaceInstallProbe = {
  async probe(
    marketplace: MarketplaceIdentity,
    expectedPlugins: readonly string[],
  ): Promise<MarketplaceInstallReading> {
    const clean: MarketplaceInstallReading = {
      errored: false,
      surfacePresent: false,
      unregistered: false,
      drifted: false,
    };
    let reading = clean;
    for (const cli of ["claude", "codex"]) {
      if (!pluginSurfacePresent(cli)) continue;
      const state = await surfaceState(cli, marketplace, expectedPlugins);
      if (!state.ok) {
        return { errored: true, surfacePresent: true, unregistered: false, drifted: false };
      }
      reading = {
        errored: false,
        surfacePresent: true,
        unregistered: reading.unregistered || state.unregistered,
        drifted: reading.drifted || state.drifted,
      };
    }
    return reading;
  },
};
