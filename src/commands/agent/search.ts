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
  detectWorktreeProductRoot,
  GIT_ROOT_COMMAND,
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  type GitDependencies,
  parseGitWorktreePorcelainRecords,
} from "@/lib/git/root";

export interface AgentSearchCommandDeps {
  readonly fs: AgentSearchFileSystem;
  readonly agentHomeDirs: () => AgentHomeDirs;
  readonly nowMs: () => number;
  readonly resolveProductScopeRoot: (cwd: string, fallbackProductScopeRoot: string) => Promise<string>;
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

export async function resolveAgentSearchProductScopeRoot(
  cwd: string,
  fallbackProductScopeRoot: string,
  gitDeps: GitDependencies = defaultGitDependencies,
): Promise<string> {
  const result = await detectWorktreeProductRoot(cwd, gitDeps);
  return result.isGitRepo ? result.productDir : fallbackProductScopeRoot;
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
  const productScopeRoot = await deps.resolveProductScopeRoot(options.cwd, options.fallbackProductScopeRoot);
  return searchAgentSessions({
    agentHomeDirs: deps.agentHomeDirs(),
    nowMs: deps.nowMs(),
    productScopeRoot,
    branchAssociatedWorktreeRoots: options.query.branch === null
      ? []
      : await deps.resolveBranchAssociatedWorktreeRoots(productScopeRoot, options.query.branch),
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
