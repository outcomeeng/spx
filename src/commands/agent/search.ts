import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";

import {
  AGENT_SESSION_STORE,
  type AgentSearchFileSystem,
  type AgentSearchQuery,
  type AgentSessionDirEntry,
  renderAgentSearchJson,
  renderAgentSearchList,
  searchAgentSessions,
} from "@/domains/agent";
import { detectGitCommonDirProductRoot } from "@/git/root";

export interface AgentSearchCommandDeps {
  readonly fs: AgentSearchFileSystem;
  readonly homeDir: () => string;
  readonly nowMs: () => number;
  readonly resolveProductScopeRoot: (cwd: string, fallbackProductScopeRoot: string) => Promise<string>;
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
  homeDir: homedir,
  nowMs: Date.now,
  resolveProductScopeRoot: async (cwd, _fallbackProductScopeRoot) => {
    const result = await detectGitCommonDirProductRoot(cwd);
    return result.productDir;
  },
};

export async function listAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  const deps = options.deps ?? defaultAgentSearchCommandDeps;
  const results = await searchAgentSessions({
    homeDir: deps.homeDir(),
    nowMs: deps.nowMs(),
    productScopeRoot: await deps.resolveProductScopeRoot(options.cwd, options.fallbackProductScopeRoot),
    fs: deps.fs,
    query: options.query,
  });
  return renderAgentSearchList(results);
}

export async function jsonAgentSearchSessions(options: AgentSearchCommandOptions): Promise<string> {
  const deps = options.deps ?? defaultAgentSearchCommandDeps;
  const results = await searchAgentSessions({
    homeDir: deps.homeDir(),
    nowMs: deps.nowMs(),
    productScopeRoot: await deps.resolveProductScopeRoot(options.cwd, options.fallbackProductScopeRoot),
    fs: deps.fs,
    query: options.query,
  });
  return renderAgentSearchJson(results);
}
