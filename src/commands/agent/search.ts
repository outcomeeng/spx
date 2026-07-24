import { open, readdir, readFile, stat } from "node:fs/promises";

import {
  AGENT_SESSION_STORE,
  type AgentHomeDirs,
  type AgentSearchFileSystem,
  type AgentSearchQuery,
  type AgentSearchResult,
  type AgentSessionDirEntry,
  renderAgentSearchJson,
  renderAgentSearchList,
  resolveAgentHomeDirs,
  searchAgentSessions,
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

export const defaultAgentSearchCommandDeps: AgentSearchCommandDeps = {
  fs: nodeAgentSearchFileSystem,
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
    query: options.query,
  });
}

export async function listAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  return renderAgentSearchList(await loadAgentSearchResults(options));
}

export async function jsonAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  return renderAgentSearchJson(await loadAgentSearchResults(options));
}
