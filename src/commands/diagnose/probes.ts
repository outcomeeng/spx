/**
 * Default diagnose check probes — the reading-gathering orchestration the
 * descriptor wires into the check registry. Each probe gathers its check's
 * reading by shelling out to git, the on-PATH `spx`, and the plugin CLIs, and
 * degrades to an errored reading on any failure so the pure classifier maps it
 * to an unknown verdict. Command-layer I/O orchestration: filesystem and
 * subprocess reads with no Commander binding and no process exit.
 *
 * @module commands/diagnose/probes
 */

import { execa } from "execa";

import type { MarketplaceInstallProbe, MarketplaceInstallReading } from "@/domains/diagnose/checks/marketplace-install";
import type { SessionEnvironmentProbe, SessionEnvironmentReading } from "@/domains/diagnose/checks/session-environment";
import type { SessionStoreProbe, SessionStoreReading } from "@/domains/diagnose/checks/session-store";
import type { WorktreePoolProbe, WorktreePoolReading } from "@/domains/diagnose/checks/worktree-pool";
import type { MarketplaceIdentity } from "@/domains/diagnose/manifest";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { resolveAgentSessionId } from "@/domains/session/agent-session";
import type { SessionRecord } from "@/domains/session/list";
import {
  classifyOccupancy,
  OCCUPANCY_STATUS,
  type OccupancyStatus,
  readClaim,
} from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { detectGitCommonDirProductRoot, gatherGitFacts } from "@/git/root";
import { findExecutableOnPath } from "@/lib/executable-on-path";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";

const SPX = "spx";

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

/**
 * The occupancy status from one `spx worktree status --format json` object, or
 * null when the output is unparseable. Reading the structured `status` field
 * avoids a substring match against the rendered line, whose worktree name can
 * itself contain an occupancy word.
 */
function worktreeStatusOf(stdout: string): OccupancyStatus | null {
  try {
    const parsed = JSON.parse(stdout) as { status?: string };
    // Match against the canonical values so an unrecognized or malformed status
    // degrades to the errored (unknown) reading rather than a clean one.
    return Object.values(OCCUPANCY_STATUS).find((value) => value === parsed.status) ?? null;
  } catch {
    return null;
  }
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
    const facts = await gatherGitFacts();
    if (!facts?.worktreeListRead) return errored;

    const bareRepository = facts.commonDirIsBare;
    const paths = facts.worktreeRoots;
    const linkedWorktrees = !bareRepository && paths.length > 1;

    // Occupancy comes only from spx; with spx unreachable the stale-claim
    // reading is unknowable, so degrade to errored rather than affirm a
    // compliant pool whose claims went unchecked.
    const spx = resolveSpx();
    if (spx === null) return errored;

    let staleClaim = false;
    for (const path of paths) {
      const status = await runCapture(spx, ["worktree", "status", path, "--format", "json"]);
      if (!status.ok) return errored;
      const occupancy = worktreeStatusOf(status.stdout);
      if (occupancy === null) return errored;
      if (occupancy === OCCUPANCY_STATUS.STALE) {
        staleClaim = true;
        break;
      }
    }
    return { errored: false, bareRepository, linkedWorktrees, staleClaim };
  },
};

/** Resolves the session-environment reading from the agent-session env vars and the worktree-claim round-trip. */
export const defaultSessionEnvironmentProbe: SessionEnvironmentProbe = {
  async probe(): Promise<SessionEnvironmentReading> {
    // The spec-tree SessionStart hook always exports CLAUDE_WORKTREE_CLAIMED on
    // every run and every runtime (even when it resolves no session id), so its
    // presence is the runtime-agnostic signal that the hook ran. CODEX_THREAD_ID
    // is set by the Codex runtime before any hook, so it cannot signal hook
    // presence — a Codex session with no spec-tree hook would falsely read as a
    // silent no-op rather than not-applicable.
    const hookPresent = HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED in process.env;
    const sessionIdentity = resolveAgentSessionId(process.env) !== undefined;

    const spx = resolveSpx();
    if (spx === null) {
      return { errored: false, hookPresent, sessionIdentity, worktreeClaimed: false, roundTripStale: false };
    }
    const status = await runCapture(spx, ["worktree", "status", "--format", "json"]);
    if (!status.ok) {
      return { errored: true, hookPresent, sessionIdentity, worktreeClaimed: false, roundTripStale: false };
    }
    const occupancy = worktreeStatusOf(status.stdout);
    if (occupancy === null) {
      return { errored: true, hookPresent, sessionIdentity, worktreeClaimed: false, roundTripStale: false };
    }
    return {
      errored: false,
      hookPresent,
      sessionIdentity,
      worktreeClaimed: occupancy === OCCUPANCY_STATUS.OCCUPIED,
      roundTripStale: occupancy === OCCUPANCY_STATUS.STALE,
    };
  },
};

async function claimedSessionIds(): Promise<ReadonlySet<string> | null> {
  const root = await detectGitCommonDirProductRoot();
  if (!root.isGitRepo) return null;
  const worktreesDir = worktreesScopeDir(root.productDir);
  const facts = await gatherGitFacts();
  if (!facts?.worktreeListRead) return null;

  const sessionIds = new Set<string>();
  for (const path of facts.worktreeRoots) {
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

    let doing: readonly SessionRecord[];
    try {
      const parsed = JSON.parse(list.stdout) as { doing?: readonly SessionRecord[] };
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

interface InstalledPlugin {
  readonly name: string;
  readonly enabled: boolean;
}

/**
 * Normalizes the installed plugins from `claude`/`codex plugin list --json`, or
 * null when the output is unparseable. Claude emits a flat array of
 * `{ id: "name@marketplace", enabled }`; Codex emits `{ installed: [{ name, enabled }] }`.
 */
function parseInstalledPlugins(stdout: string): readonly InstalledPlugin[] | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => {
        const record = entry as { id?: string; enabled?: boolean };
        return { name: String(record.id ?? "").split("@")[0], enabled: record.enabled === true };
      });
    }
    const installed = (parsed as { installed?: unknown }).installed;
    if (Array.isArray(installed)) {
      return installed.map((entry) => {
        const record = entry as { name?: string; enabled?: boolean };
        return { name: String(record.name ?? ""), enabled: record.enabled === true };
      });
    }
    return null;
  } catch {
    return null;
  }
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

  const plugins = await runCapture(cli, ["plugin", "list", "--json"]);
  if (!plugins.ok) return { ok: false, unregistered: false, drifted: false };
  const installed = parseInstalledPlugins(plugins.stdout);
  if (installed === null) return { ok: false, unregistered: false, drifted: false };
  // A surface drifts when an expected plugin is absent or installed but disabled,
  // read from the structured enabled flag rather than a name substring match.
  const drifted = expectedPlugins.some((expected) => {
    const found = installed.find((plugin) => plugin.name === expected);
    return !found?.enabled;
  });
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
