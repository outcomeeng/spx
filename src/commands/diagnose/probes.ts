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

import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { execa } from "execa";

import { DEFAULT_METHODOLOGY_VERSION, type MethodologyConfig } from "@/config/methodology";
import { resolveAgentHomeDirs } from "@/domains/agent";
import type {
  MarketplaceInstallProbe,
  MarketplaceInstallProbeReading,
} from "@/domains/diagnose/checks/marketplace-install";
import type {
  MethodologyContextObservation,
  MethodologyContextProbe,
} from "@/domains/diagnose/checks/methodology-context";
import type { SessionEnvironmentProbe, SessionEnvironmentReading } from "@/domains/diagnose/checks/session-environment";
import {
  doingSessionBackedByClaim,
  type SessionStoreProbe,
  type SessionStoreReading,
} from "@/domains/diagnose/checks/session-store";
import type { WorktreePoolProbe, WorktreePoolReading } from "@/domains/diagnose/checks/worktree-pool";
import type { MarketplaceIdentity } from "@/domains/diagnose/facts";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { normalizeAgentSessionToken, resolveAgentSessionId } from "@/domains/session/agent-session";
import type { SessionRecord } from "@/domains/session/list";
import {
  classifyOccupancy,
  OCCUPANCY_CLAIM,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  type OccupancyStatus,
  readClaim,
} from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { findExecutableOnPath } from "@/lib/executable-on-path";
import {
  defaultGitDependencies,
  gatherGitFacts,
  GIT_ROOT_COMMAND,
  type GitFacts,
  mainCheckoutPath,
  resolveDefaultBranch,
} from "@/lib/git/root";
import { compareNumericVersionIdentifiers } from "@/lib/spec-tree/config";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";

export const DIAGNOSE_SPX_EXECUTABLE = "spx";
export const DIAGNOSE_DOING_SESSION_ARGS = ["session", "list", "--status", "doing", "--json"] as const;

const PLUGIN_CACHE_SEGMENTS = ["plugins", "cache"] as const;
const NOT_FOUND_ERROR_CODE = "ENOENT";
const VERSION_DIRECTORY_PATTERN = /^\d+(?:\.\d+)*$/;
const MAIN_CHECKOUT_SYMBOLIC_REF_ARGS = [
  GIT_ROOT_COMMAND.SYMBOLIC_REF,
  GIT_ROOT_COMMAND.QUIET,
  GIT_ROOT_COMMAND.SHORT,
  GIT_ROOT_COMMAND.HEAD,
] as const;

export interface MainCheckoutBranchReading {
  readonly read: boolean;
  readonly branch: string | null;
}

export interface WorktreePoolSnapshotEntry {
  readonly root: string;
  readonly name: string;
  readonly status: OccupancyStatus;
  readonly sessionId?: string;
}

export interface WorktreePoolSnapshot {
  readonly errored: boolean;
  readonly bareRepository: boolean;
  readonly linkedWorktrees: boolean;
  readonly mainCheckoutPath: string | null;
  readonly defaultBranch: string | null;
  readonly mainCheckoutBranch: string | null;
  readonly mainCheckoutBranchRead: boolean;
  readonly worktrees: readonly WorktreePoolSnapshotEntry[];
  readonly currentWorktreeRoot: string | null;
  readonly liveClaimSessionIds: ReadonlySet<string>;
}

export interface WorktreePoolSnapshotDependencies {
  readonly gatherGitFacts: () => Promise<GitFacts | null>;
  readonly resolveDefaultBranch?: () => Promise<string | null>;
  readonly readMainCheckoutBranch?: (path: string) => Promise<MainCheckoutBranchReading>;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fs: OccupancyFileSystem;
  readonly processTable: ProcessTable;
}

interface MainCheckoutStanding {
  readonly mainCheckoutPath: string | null;
  readonly defaultBranch: string | null;
  readonly mainCheckoutBranch: string | null;
  readonly mainCheckoutBranchRead: boolean;
}

export interface SessionEnvironmentSnapshotInput {
  readonly hookPresent: boolean;
  readonly sessionIdentity: boolean;
}

export interface WorktreePoolSnapshotProvider {
  read(): Promise<WorktreePoolSnapshot>;
}

async function readMainCheckoutBranch(path: string): Promise<MainCheckoutBranchReading> {
  try {
    const result = await defaultGitDependencies.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...MAIN_CHECKOUT_SYMBOLIC_REF_ARGS],
      { cwd: path, reject: false },
    );
    if (result.exitCode === 0) return { read: true, branch: result.stdout.trim() };
    if (result.exitCode === 1) return { read: true, branch: null };
    return { read: false, branch: null };
  } catch {
    return { read: false, branch: null };
  }
}

const defaultWorktreePoolSnapshotDependencies: WorktreePoolSnapshotDependencies = {
  env: process.env,
  gatherGitFacts,
  resolveDefaultBranch,
  readMainCheckoutBranch,
  fs: defaultOccupancyFileSystem,
  processTable: defaultProcessTable,
};

interface ExportedClaimReading {
  readonly errored: boolean;
  readonly name?: string;
  readonly running: boolean;
  readonly sessionId?: string;
}

interface ExportedClaimDependencies {
  readonly fs: OccupancyFileSystem;
  readonly processTable: ProcessTable;
}

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
  return findExecutableOnPath(DIAGNOSE_SPX_EXECUTABLE);
}

function erroredSessionStoreReading(): SessionStoreReading {
  return { errored: true, orphanedClaims: 0 };
}

function erroredWorktreePoolSnapshot(): WorktreePoolSnapshot {
  return {
    errored: true,
    bareRepository: false,
    linkedWorktrees: false,
    mainCheckoutPath: null,
    defaultBranch: null,
    mainCheckoutBranch: null,
    mainCheckoutBranchRead: false,
    worktrees: [],
    currentWorktreeRoot: null,
    liveClaimSessionIds: new Set(),
  };
}

function parseDoingSessions(stdout: string): readonly SessionRecord[] | null {
  try {
    const parsed = JSON.parse(stdout) as { doing?: unknown };
    return Array.isArray(parsed.doing) ? parsed.doing as readonly SessionRecord[] : null;
  } catch {
    return null;
  }
}

async function gatherMainCheckoutStanding(
  facts: GitFacts,
  deps: WorktreePoolSnapshotDependencies,
): Promise<MainCheckoutStanding> {
  const designatedMainCheckout = mainCheckoutPath(facts);
  if (!facts.commonDirIsBare) {
    return {
      mainCheckoutPath: designatedMainCheckout,
      defaultBranch: null,
      mainCheckoutBranch: null,
      mainCheckoutBranchRead: true,
    };
  }

  const defaultBranch = await (deps.resolveDefaultBranch ?? resolveDefaultBranch)();
  const branchReading = designatedMainCheckout === null
    ? { read: true, branch: null }
    : await (deps.readMainCheckoutBranch ?? readMainCheckoutBranch)(designatedMainCheckout);
  return {
    mainCheckoutPath: designatedMainCheckout,
    defaultBranch,
    mainCheckoutBranch: branchReading.branch,
    mainCheckoutBranchRead: branchReading.read,
  };
}

export async function gatherWorktreePoolSnapshot(
  deps: WorktreePoolSnapshotDependencies = defaultWorktreePoolSnapshotDependencies,
): Promise<WorktreePoolSnapshot> {
  const facts = await deps.gatherGitFacts();
  if (!facts?.worktreeListRead) return erroredWorktreePoolSnapshot();

  const mainCheckoutStanding = await gatherMainCheckoutStanding(facts, deps);

  const worktreesDir = worktreesScopeDir(dirname(facts.commonDir));
  const worktrees: WorktreePoolSnapshotEntry[] = [];
  const liveClaimSessionIds = new Set<string>();

  for (const root of facts.worktreeRoots) {
    const name = worktreeClaimName(root);
    const claim = await readClaim(worktreesDir, name, { fs: deps.fs });
    if (!claim.ok) return erroredWorktreePoolSnapshot();

    const status = classifyOccupancy(claim.value, deps.processTable);
    const sessionId = status === OCCUPANCY_STATUS.RUNNING && claim.value !== undefined
      ? normalizeAgentSessionToken(claim.value.sessionId)
      : undefined;
    if (sessionId !== undefined) liveClaimSessionIds.add(sessionId);
    worktrees.push({ root, name, status, sessionId });
  }

  const exportedClaim = await exportedClaimReadingFromEnv(deps.env, deps);
  if (exportedClaim.errored) return erroredWorktreePoolSnapshot();

  const currentWorktreeIndex = worktrees.findIndex((worktree) => worktree.root === facts.worktreeRoot);
  const currentWorktree = currentWorktreeIndex === -1 ? undefined : worktrees[currentWorktreeIndex];
  if (
    currentWorktree !== undefined
    && exportedClaim.running
    && exportedClaim.sessionId !== undefined
    && exportedClaim.name === currentWorktree.name
  ) {
    liveClaimSessionIds.add(exportedClaim.sessionId);
    worktrees[currentWorktreeIndex] = {
      ...currentWorktree,
      status: OCCUPANCY_STATUS.RUNNING,
      sessionId: exportedClaim.sessionId,
    };
  }

  return {
    errored: false,
    bareRepository: facts.commonDirIsBare,
    linkedWorktrees: !facts.commonDirIsBare && facts.worktreeRoots.length > 1,
    ...mainCheckoutStanding,
    worktrees,
    currentWorktreeRoot: facts.worktreeRoot,
    liveClaimSessionIds,
  };
}

export function worktreePoolReadingFromSnapshot(snapshot: WorktreePoolSnapshot): WorktreePoolReading {
  if (snapshot.errored) {
    return {
      errored: true,
      bareRepository: false,
      linkedWorktrees: false,
      mainCheckoutPath: null,
      defaultBranch: null,
      mainCheckoutBranch: null,
      mainCheckoutBranchRead: false,
      running: 0,
      free: 0,
    };
  }

  let running = 0;
  let free = 0;
  for (const worktree of snapshot.worktrees) {
    if (worktree.status === OCCUPANCY_STATUS.RUNNING) running += 1;
    else free += 1;
  }

  return {
    errored: false,
    bareRepository: snapshot.bareRepository,
    linkedWorktrees: snapshot.linkedWorktrees,
    mainCheckoutPath: snapshot.mainCheckoutPath,
    defaultBranch: snapshot.defaultBranch,
    mainCheckoutBranch: snapshot.mainCheckoutBranch,
    mainCheckoutBranchRead: snapshot.mainCheckoutBranchRead,
    running,
    free,
  };
}

export function sessionEnvironmentReadingFromSnapshot(
  snapshot: WorktreePoolSnapshot,
  environment: SessionEnvironmentSnapshotInput,
): SessionEnvironmentReading {
  const currentWorktree = snapshot.worktrees.find((worktree) => worktree.root === snapshot.currentWorktreeRoot);
  const worktreeClaimed = currentWorktree?.status === OCCUPANCY_STATUS.RUNNING;
  return {
    errored: snapshot.errored,
    hookPresent: environment.hookPresent,
    sessionIdentity: environment.sessionIdentity || (worktreeClaimed && currentWorktree.sessionId !== undefined),
    worktreeClaimed,
  };
}

async function exportedClaimReadingFromEnv(
  env: Readonly<Record<string, string | undefined>> | undefined,
  deps: ExportedClaimDependencies,
): Promise<ExportedClaimReading> {
  const claimPath = env?.[HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH];
  if (claimPath === undefined) return { errored: false, running: false };

  const claimName = basename(claimPath, OCCUPANCY_CLAIM.FILE_EXTENSION);
  const claim = await readClaim(dirname(claimPath), claimName, { fs: deps.fs });
  if (!claim.ok) return { errored: true, running: false };

  const running = classifyOccupancy(claim.value, deps.processTable) === OCCUPANCY_STATUS.RUNNING;
  return {
    errored: false,
    name: claimName,
    running,
    sessionId: running && claim.value !== undefined ? normalizeAgentSessionToken(claim.value.sessionId) : undefined,
  };
}

export function sessionStoreReadingFromSnapshot(
  snapshot: WorktreePoolSnapshot,
  doing: readonly SessionRecord[],
): SessionStoreReading {
  if (snapshot.errored) return { errored: true, orphanedClaims: 0 };

  let orphanedClaims = 0;
  for (const session of doing) {
    if (!doingSessionBackedByClaim(session, snapshot.liveClaimSessionIds)) orphanedClaims += 1;
  }
  return { errored: false, orphanedClaims };
}

export function createWorktreePoolSnapshotProvider(
  deps: WorktreePoolSnapshotDependencies = defaultWorktreePoolSnapshotDependencies,
): WorktreePoolSnapshotProvider {
  let snapshot: Promise<WorktreePoolSnapshot> | undefined;
  return {
    read() {
      snapshot ??= gatherWorktreePoolSnapshot(deps);
      return snapshot;
    },
  };
}

export function worktreePoolProbeFromSnapshotProvider(provider: WorktreePoolSnapshotProvider): WorktreePoolProbe {
  return {
    async probe(): Promise<WorktreePoolReading> {
      return worktreePoolReadingFromSnapshot(await provider.read());
    },
  };
}

export function sessionEnvironmentProbeFromSnapshotProvider(
  provider: WorktreePoolSnapshotProvider,
  env: Readonly<Record<string, string | undefined>> = process.env,
): SessionEnvironmentProbe {
  return {
    async probe(): Promise<SessionEnvironmentReading> {
      const hookPresent = HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH in env;
      const sessionIdentity = resolveAgentSessionId(env) !== undefined;
      const snapshot = await provider.read();
      return sessionEnvironmentReadingFromSnapshot(snapshot, {
        hookPresent,
        sessionIdentity,
      });
    },
  };
}

export function sessionStoreProbeFromSnapshotProvider(provider: WorktreePoolSnapshotProvider): SessionStoreProbe {
  return {
    async probe(): Promise<SessionStoreReading> {
      const spx = resolveSpx();
      if (spx === null) return erroredSessionStoreReading();

      const list = await runCapture(spx, DIAGNOSE_DOING_SESSION_ARGS);
      const snapshot = await provider.read();
      if (!list.ok || snapshot.errored) return erroredSessionStoreReading();

      const doing = parseDoingSessions(list.stdout);
      if (doing === null) return erroredSessionStoreReading();

      return sessionStoreReadingFromSnapshot(snapshot, doing);
    },
  };
}

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

interface RegisteredMarketplace {
  readonly name: string;
  readonly source: string;
}

/**
 * Normalizes the registered marketplaces from `claude`/`codex plugin marketplace list --json`,
 * or null when the output is unparseable. Claude emits a flat array of `{ name, repo }`
 * (`repo` is the `owner/repo` source); Codex emits `{ marketplaces: [{ name, marketplaceSource: { source } }] }`.
 */
function parseRegisteredMarketplaces(stdout: string): readonly RegisteredMarketplace[] | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => {
        const record = entry as { name?: string; repo?: string };
        return { name: String(record.name ?? ""), source: String(record.repo ?? "") };
      });
    }
    const marketplaces = (parsed as { marketplaces?: unknown }).marketplaces;
    if (Array.isArray(marketplaces)) {
      return marketplaces.map((entry) => {
        const record = entry as { name?: string; marketplaceSource?: { source?: string } };
        return { name: String(record.name ?? ""), source: String(record.marketplaceSource?.source ?? "") };
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
  const marketplaces = await runCapture(cli, ["plugin", "marketplace", "list", "--json"]);
  if (!marketplaces.ok) return { ok: false, unregistered: false, drifted: false };
  const registry = parseRegisteredMarketplaces(marketplaces.stdout);
  if (registry === null) return { ok: false, unregistered: false, drifted: false };
  // Match the marketplace identity on exact structured fields rather than a
  // substring of the rendered list, consistent with the plugin-list parse below.
  const registered = registry.some((entry) => entry.name === marketplace.name || entry.source === marketplace.source);
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
  ): Promise<MarketplaceInstallProbeReading> {
    const clean: MarketplaceInstallProbeReading = {
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

interface LatestDirectoryReading {
  readonly errored: boolean;
  readonly version: string | null;
}

interface VersionDirectoriesReading {
  readonly errored: boolean;
  readonly versions: readonly string[];
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && (error as { readonly code?: unknown }).code === code;
}

async function versionDirectories(path: string): Promise<VersionDirectoriesReading> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const versions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    return { errored: false, versions };
  } catch (error) {
    if (isNodeErrorCode(error, NOT_FOUND_ERROR_CODE)) {
      return { errored: false, versions: [] };
    }
    return { errored: true, versions: [] };
  }
}

function isVersionDirectoryName(name: string): boolean {
  return VERSION_DIRECTORY_PATTERN.test(name);
}

function selectConfiguredVersion(
  readings: readonly VersionDirectoriesReading[],
  config: MethodologyConfig,
): LatestDirectoryReading {
  const versions = readings.flatMap((reading) => reading.versions);
  const validVersions = versions
    .filter(isVersionDirectoryName)
    .sort(compareNumericVersionIdentifiers);
  let version: string | null;
  if (config.version === DEFAULT_METHODOLOGY_VERSION) {
    version = validVersions.at(-1) ?? null;
  } else {
    version = versions.find((candidate) => candidate === config.version)
      ?? validVersions.at(-1)
      ?? null;
  }
  return {
    errored: readings.some((reading) => reading.errored),
    version,
  };
}

async function configuredVersionDirectory(
  paths: readonly string[],
  config: MethodologyConfig,
): Promise<LatestDirectoryReading> {
  return selectConfiguredVersion(
    await Promise.all(paths.map((path) => versionDirectories(path))),
    config,
  );
}

export function createMethodologyContextProbe(...agentHomeDirs: readonly string[]): MethodologyContextProbe {
  const resolvedHomes = resolveAgentHomeDirs();
  const homeDirs = agentHomeDirs.length > 0 ? agentHomeDirs : [resolvedHomes.codex, resolvedHomes.claudeCode];
  return {
    async probe(config): Promise<MethodologyContextObservation> {
      const sourcePaths = homeDirs.map((home) => join(home, ...PLUGIN_CACHE_SEGMENTS, ...config.source.split("/")));
      const reading = await configuredVersionDirectory(sourcePaths, config);
      if (reading.version === null) {
        return { source: null, version: null, errored: reading.errored };
      }
      return {
        source: config.source,
        version: reading.version,
        errored: reading.errored,
      };
    },
  };
}

export const defaultMethodologyContextProbe: MethodologyContextProbe = {
  probe(config): Promise<MethodologyContextObservation> {
    return createMethodologyContextProbe().probe(config);
  },
};
