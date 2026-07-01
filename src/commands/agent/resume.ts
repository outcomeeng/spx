import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";

import {
  AGENT_SESSION_STORE,
  type AgentResumeCandidate,
  type AgentResumeScope,
  type AgentSessionDirEntry,
  type AgentSessionFileSystem,
  discoverAgentResumeCandidates,
  renderAgentResumeJson,
  renderAgentResumeList,
} from "@/domains/agent";
import { detectWorktreeProductRoot } from "@/git/root";

export interface AgentResumeCommandDeps {
  readonly fs: AgentSessionFileSystem;
  readonly homeDir: () => string;
  readonly nowMs: () => number;
  readonly resolveWorktreeRoot: (cwd: string) => Promise<string | null>;
}

export interface AgentResumeCommandOptions {
  readonly cwd: string;
  readonly scope: AgentResumeScope;
  readonly deps?: AgentResumeCommandDeps;
}

export const nodeAgentSessionFileSystem: AgentSessionFileSystem = {
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
  async stat(path) {
    const result = await stat(path);
    return { mtimeMs: result.mtimeMs };
  },
};

export const defaultAgentResumeCommandDeps: AgentResumeCommandDeps = {
  fs: nodeAgentSessionFileSystem,
  homeDir: homedir,
  nowMs: Date.now,
  resolveWorktreeRoot: async (cwd) => {
    const result = await detectWorktreeProductRoot(cwd);
    return result.isGitRepo ? result.productDir : null;
  },
};

export async function loadAgentResumeCandidates(
  options: AgentResumeCommandOptions,
): Promise<AgentResumeCandidate[]> {
  const deps = options.deps ?? defaultAgentResumeCommandDeps;
  return discoverAgentResumeCandidates({
    invocationDir: options.cwd,
    homeDir: deps.homeDir(),
    nowMs: deps.nowMs(),
    scope: options.scope,
    fs: deps.fs,
    resolveWorktreeRoot: deps.resolveWorktreeRoot,
  });
}

export async function listAgentResumeSessions(options: AgentResumeCommandOptions): Promise<string> {
  return renderAgentResumeList(await loadAgentResumeCandidates(options));
}

export async function jsonAgentResumeSessions(options: AgentResumeCommandOptions): Promise<string> {
  return renderAgentResumeJson(await loadAgentResumeCandidates(options));
}
