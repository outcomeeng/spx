import { execa } from "execa";
import { open, readdir, readFile, stat } from "node:fs/promises";

import {
  AGENT_SESSION_STORE,
  type AgentHomeDirs,
  type AgentSearchFileSystem,
  type AgentSearchQuery,
  type AgentSearchResult,
  type AgentSessionDirEntry,
  createRipgrepTranscriptLocator,
  renderAgentSearchJson,
  renderAgentSearchList,
  resolveAgentHomeDirs,
  RIPGREP_EXIT_CODE,
  RIPGREP_LOCATOR_COMMAND,
  searchAgentSessions,
  type TranscriptLocator,
  type TranscriptLocatorRunner,
  type TranscriptLocatorRunResult,
} from "@/domains/agent";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  GIT_ROOT_COMMAND,
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  type GitDependencies,
  parseGitWorktreePorcelainRecords,
} from "@/lib/git/root";

/**
 * The two roots of `spx/15-worktree-management.pdr.md`. Search filters candidates by
 * `productScopeRoot`, but `git worktree list` must run from `worktreeRoot`: in a
 * bare-repository pool the product root is the pool container, which is not itself a
 * git working directory.
 */
export interface AgentSearchScopeRoots {
  readonly productScopeRoot: string;
  readonly worktreeRoot: string;
}

export interface AgentSearchCommandDeps {
  readonly fs: AgentSearchFileSystem;
  readonly locator: TranscriptLocator;
  readonly agentHomeDirs: () => AgentHomeDirs;
  readonly nowMs: () => number;
  readonly resolveProductScopeRoot: (cwd: string, fallbackProductScopeRoot: string) => Promise<AgentSearchScopeRoots>;
  readonly resolveBranchAssociatedWorktreeRoots: (cwd: string, branch: string) => Promise<readonly string[]>;
}

export interface AgentSearchCommandOptions {
  readonly cwd: string;
  readonly fallbackProductScopeRoot: string;
  readonly query: AgentSearchQuery;
  readonly deps?: AgentSearchCommandDeps;
}

export const nodeAgentSearchFileSystem: AgentSearchFileSystem = {
  async readDir(path) {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((entry): AgentSessionDirEntry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  },
  async readHead(path, maxBytes) {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.toString(AGENT_SESSION_STORE.TEXT_ENCODING, 0, bytesRead);
    } finally {
      await handle.close();
    }
  },
  async readText(path) {
    return readFile(path, AGENT_SESSION_STORE.TEXT_ENCODING);
  },
  async stat(path) {
    const result = await stat(path);
    return { mtimeMs: result.mtimeMs };
  },
};

/** The outcome of one ripgrep process as the process dependency reports it: a subset of execa's result. */
export interface RipgrepProcessOutcome {
  /** Ripgrep's exit status; absent when the process did not exit normally. */
  readonly exitCode?: number;
  /** The Node error code when the executable could not be started, such as `ENOENT`. */
  readonly code?: string;
  /** The signal that terminated the process, when one did. */
  readonly signal?: string;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface TranscriptLocatorRunnerDependencies {
  readonly runRipgrep: (args: readonly string[]) => Promise<RipgrepProcessOutcome>;
}

/** The diagnostic a signal-terminated ripgrep run carries as its failure output. */
export const RIPGREP_SIGNAL_DIAGNOSTIC = "ripgrep terminated by signal";

export const defaultTranscriptLocatorRunnerDependencies: TranscriptLocatorRunnerDependencies = {
  runRipgrep: async (args) => {
    const result = await execa(RIPGREP_LOCATOR_COMMAND.EXECUTABLE, [...args], {
      reject: false,
      encoding: "buffer",
      stripFinalNewline: false,
    });
    return {
      exitCode: result.exitCode,
      code: "code" in result && typeof result.code === "string" ? result.code : undefined,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

/**
 * Maps a ripgrep process outcome to the locator's run result. A process that neither exited
 * nor was terminated by a signal never started — whatever error code the spawn reported — and
 * is the unstartable result (null exit code); a signal-terminated run is a failed run whose
 * diagnostic names the signal; an exited run carries ripgrep's own exit status and its
 * NUL-terminated output bytes.
 */
export function transcriptLocatorRunResultFromOutcome(outcome: RipgrepProcessOutcome): TranscriptLocatorRunResult {
  if (outcome.exitCode === undefined && outcome.signal === undefined) {
    return { exitCode: null, stdout: new Uint8Array(), stderr: "" };
  }
  if (outcome.exitCode === undefined) {
    return {
      exitCode: RIPGREP_EXIT_CODE.ERROR,
      stdout: new Uint8Array(),
      stderr: `${RIPGREP_SIGNAL_DIAGNOSTIC} ${outcome.signal}`,
    };
  }
  return {
    exitCode: outcome.exitCode,
    stdout: outcome.stdout,
    stderr: Buffer.from(outcome.stderr).toString(AGENT_SESSION_STORE.TEXT_ENCODING),
  };
}

/** Starts ripgrep through the injected process dependency and maps its outcome to a run result. */
export function createTranscriptLocatorRunner(
  deps: TranscriptLocatorRunnerDependencies = defaultTranscriptLocatorRunnerDependencies,
): TranscriptLocatorRunner {
  return async (args) => transcriptLocatorRunResultFromOutcome(await deps.runRipgrep(args));
}

export const execaTranscriptLocatorRunner: TranscriptLocatorRunner = createTranscriptLocatorRunner();

export const defaultAgentSearchCommandDeps: AgentSearchCommandDeps = {
  fs: nodeAgentSearchFileSystem,
  locator: createRipgrepTranscriptLocator(execaTranscriptLocatorRunner),
  agentHomeDirs: resolveAgentHomeDirs,
  nowMs: Date.now,
  resolveProductScopeRoot: resolveAgentSearchProductScopeRoot,
  resolveBranchAssociatedWorktreeRoots: resolveAgentSearchBranchAssociatedWorktreeRoots,
};

/**
 * Search scope is the Git common-dir product root, not the local worktree root: a
 * session recorded in any worktree of the pool belongs to the same product, and
 * scoping to `--show-toplevel` would hide every sibling worktree's sessions from a
 * content, pickup, session-id, or agent-kind search. `spx agent resume` keeps the
 * worktree root because resuming targets the checkout the user is standing in.
 */
export async function resolveAgentSearchProductScopeRoot(
  cwd: string,
  fallbackProductScopeRoot: string,
  gitDeps: GitDependencies = defaultGitDependencies,
): Promise<AgentSearchScopeRoots> {
  const result = await detectGitCommonDirProductRoot(cwd, gitDeps);
  return result.isGitRepo
    ? { productScopeRoot: result.productDir, worktreeRoot: result.worktreeRoot }
    : { productScopeRoot: fallbackProductScopeRoot, worktreeRoot: fallbackProductScopeRoot };
}

export async function resolveAgentSearchBranchAssociatedWorktreeRoots(
  cwd: string,
  branch: string,
  gitDeps: GitDependencies = defaultGitDependencies,
): Promise<readonly string[]> {
  const result = await gitDeps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_WORKTREE_LIST_PORCELAIN_ARGS],
    { cwd, reject: false },
  ).catch(() => null);
  if (result === null) return [];
  if (result.exitCode !== 0) return [];
  return parseBranchAssociatedWorktreeRoots(result.stdout, branch);
}

function parseBranchAssociatedWorktreeRoots(stdout: string, branch: string): readonly string[] {
  return parseGitWorktreePorcelainRecords(stdout)
    .filter((record) => record.branch === branch)
    .map((record) => record.root);
}

export async function loadAgentSearchResults(
  options: AgentSearchCommandOptions,
): Promise<AgentSearchResult[]> {
  const deps = options.deps ?? defaultAgentSearchCommandDeps;
  const roots = await deps.resolveProductScopeRoot(options.cwd, options.fallbackProductScopeRoot);
  return searchAgentSessions({
    agentHomeDirs: deps.agentHomeDirs(),
    nowMs: deps.nowMs(),
    productScopeRoot: roots.productScopeRoot,
    branchAssociatedWorktreeRoots: options.query.branch === null
      ? []
      : await deps.resolveBranchAssociatedWorktreeRoots(roots.worktreeRoot, options.query.branch),
    fs: deps.fs,
    locator: deps.locator,
    query: options.query,
  });
}

export async function listAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  return renderAgentSearchList(await loadAgentSearchResults(options));
}

export async function jsonAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  return renderAgentSearchJson(await loadAgentSearchResults(options));
}
