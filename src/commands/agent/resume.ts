import { open, readdir, stat } from "node:fs/promises";

import {
  AGENT_SESSION_STORE,
  type AgentHomeDirs,
  type AgentResumeCandidate,
  type AgentResumeScope,
  type AgentResumeSessionFileSystem,
  type AgentSessionDirEntry,
  discoverAgentResumeCandidates,
  renderAgentResumeJson,
  renderAgentResumeList,
  resolveAgentHomeDirs,
} from "@/domains/agent";
import { detectWorktreeProductRoot } from "@/git/root";

export interface AgentResumeCommandDeps {
  readonly fs: AgentResumeSessionFileSystem;
  readonly agentHomeDirs: () => AgentHomeDirs;
  readonly nowMs: () => number;
  readonly resolveWorktreeRoot: (cwd: string, fallbackWorktreeRoot: string) => Promise<string>;
}

export interface AgentResumeCommandOptions {
  readonly cwd: string;
  readonly fallbackWorktreeRoot: string;
  readonly scope: AgentResumeScope;
  readonly deps?: AgentResumeCommandDeps;
}

export const nodeAgentSessionFileSystem: AgentResumeSessionFileSystem = {
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
  async readTail(path, maxBytes) {
    const fileStat = await stat(path);
    const bytesToRead = Math.min(maxBytes, fileStat.size);
    const start = Math.max(0, fileStat.size - bytesToRead);
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, start);
      return buffer.toString(AGENT_SESSION_STORE.TEXT_ENCODING, 0, bytesRead);
    } finally {
      await handle.close();
    }
  },
  async stat(path) {
    const result = await stat(path);
    return { mtimeMs: result.mtimeMs };
  },
};

export const defaultAgentResumeCommandDeps: AgentResumeCommandDeps = {
  fs: nodeAgentSessionFileSystem,
  agentHomeDirs: resolveAgentHomeDirs,
  nowMs: Date.now,
  resolveWorktreeRoot: async (cwd, fallbackWorktreeRoot) => {
    const result = await detectWorktreeProductRoot(cwd);
    return result.isGitRepo ? result.productDir : fallbackWorktreeRoot;
  },
};

export async function loadAgentResumeCandidates(
  options: AgentResumeCommandOptions,
): Promise<AgentResumeCandidate[]> {
  const deps = options.deps ?? defaultAgentResumeCommandDeps;
  return discoverAgentResumeCandidates({
    invocationDir: options.cwd,
    agentHomeDirs: deps.agentHomeDirs(),
    nowMs: deps.nowMs(),
    scope: options.scope,
    fs: deps.fs,
    resolveWorktreeRoot: (cwd) => deps.resolveWorktreeRoot(cwd, options.fallbackWorktreeRoot),
  });
}

export async function listAgentResumeSessions(options: AgentResumeCommandOptions): Promise<string> {
  return renderAgentResumeList(await loadAgentResumeCandidates(options));
}

export async function jsonAgentResumeSessions(options: AgentResumeCommandOptions): Promise<string> {
  return renderAgentResumeJson(await loadAgentResumeCandidates(options));
}
