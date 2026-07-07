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
  GIT_WORKTREE_PORCELAIN_BARE_LINE,
  GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
  type GitDependencies,
  normalizeGitPath,
} from "@/git/root";

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

const GIT_WORKTREE_PORCELAIN_RECORD_SEPARATOR = /\n\n+/;

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
  const roots: string[] = [];
  for (const record of stdout.split(GIT_WORKTREE_PORCELAIN_RECORD_SEPARATOR)) {
    const lines = record.split("\n");
    if (
      lines.includes(GIT_WORKTREE_PORCELAIN_BARE_LINE)
      || lines.includes(GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE)
      || lines.some((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX))
    ) {
      continue;
    }
    const rootLine = lines.find((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX));
    const branchLine = lines.find((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX));
    if (rootLine === undefined || branchLine === undefined) continue;
    if (branchLine !== `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${branch}`) continue;
    const root = normalizeGitPath(rootLine.slice(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX.length));
    if (root.length > 0) roots.push(root);
  }
  return roots;
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
