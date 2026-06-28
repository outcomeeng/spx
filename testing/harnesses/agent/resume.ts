import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  AGENT_SESSION_STORE,
  CODEX_SESSION_ORIGINATOR,
} from "@/domains/agent/protocol";
import {
  type AgentResumeCandidate,
  type AgentSessionDirEntry,
  type AgentSessionFileSystem,
} from "@/domains/agent/resume";
import {
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";

export interface TranscriptInput {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly branch?: string;
  readonly originator?: string;
}

export class ImmediateExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

interface MemoryFile {
  readonly content: string;
  readonly mtimeMs: number;
}

const CODEX_TRANSCRIPT_YEAR_DIR = "2026";
const CODEX_TRANSCRIPT_MONTH_DIR = "06";
const CODEX_TRANSCRIPT_DAY_DIR = "27";
const CANDIDATE_SAMPLE = {
  MODIFIED_AT_MS: 20,
  SESSION_ID: 21,
  WORKTREE_ROOT: 22,
  CWD: 23,
  SOURCE_HOME_DIR: 24,
} as const;

export class MemoryAgentSessionFileSystem implements AgentSessionFileSystem {
  private readonly files = new Map<string, MemoryFile>();
  private readonly readCounts = new Map<string, number>();

  writeFile(path: string, content: string, mtimeMs: number): void {
    this.files.set(resolve(path), { content, mtimeMs });
  }

  readCount(path: string): number {
    return this.readCounts.get(resolve(path)) ?? 0;
  }

  async readDir(path: string): Promise<readonly AgentSessionDirEntry[]> {
    const root = resolve(path);
    const names = new Map<string, AgentSessionDirEntry>();
    for (const filePath of this.files.keys()) {
      const relativePath = relative(root, filePath);
      if (relativePath.length === 0 || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        continue;
      }
      const [name] = relativePath.split(sep);
      const child = resolve(root, name);
      const isDirectory = [...this.files.keys()].some((candidate) => {
        const parent = dirname(candidate);
        return parent === child || parent.startsWith(`${child}${sep}`);
      });
      names.set(name, { name, isDirectory, isFile: !isDirectory });
    }
    return [...names.values()];
  }

  async readFile(path: string): Promise<string> {
    const resolved = resolve(path);
    this.readCounts.set(resolved, this.readCount(resolved) + 1);
    const file = this.files.get(resolved);
    if (file === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    return file.content;
  }

  async stat(path: string): Promise<{ readonly mtimeMs: number }> {
    const file = this.files.get(resolve(path));
    if (file === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    return { mtimeMs: file.mtimeMs };
  }
}

export function codexTranscript(input: TranscriptInput): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: input.timestamp,
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_SESSION_META,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID]: input.sessionId,
      [AGENT_SESSION_JSON_FIELDS.CWD]: input.cwd,
      [AGENT_SESSION_JSON_FIELDS.ORIGINATOR]: input.originator ?? CODEX_SESSION_ORIGINATOR.TUI,
    },
  });
}

export function codexTranscriptPath(homeDir: string, fileName: string): string {
  return join(
    homeDir,
    AGENT_SESSION_STORE.CODEX_DIR,
    AGENT_SESSION_STORE.CODEX_SESSIONS_DIR,
    CODEX_TRANSCRIPT_YEAR_DIR,
    CODEX_TRANSCRIPT_MONTH_DIR,
    CODEX_TRANSCRIPT_DAY_DIR,
    fileName,
  );
}

export function claudeCodeTranscript(input: TranscriptInput): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: input.timestamp,
    [AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL]: input.sessionId,
    [AGENT_SESSION_JSON_FIELDS.CWD]: input.cwd,
    [AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]: input.branch ?? null,
  });
}

export function agentResumeCandidate(overrides: Partial<AgentResumeCandidate> = {}): AgentResumeCandidate {
  const modifiedAtMs = overrides.modifiedAtMs
    ?? sampleAgentResumeValue(arbitraryAgentResumeNowMs(), CANDIDATE_SAMPLE.MODIFIED_AT_MS);
  const sessionId = overrides.sessionId
    ?? sampleAgentResumeValue(arbitraryAgentSessionId(), CANDIDATE_SAMPLE.SESSION_ID);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CANDIDATE_SAMPLE.WORKTREE_ROOT);
  const cwd = overrides.cwd ?? sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), CANDIDATE_SAMPLE.CWD);
  const sourceHomeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CANDIDATE_SAMPLE.SOURCE_HOME_DIR);

  return {
    agent: AGENT_SESSION_KIND.CODEX,
    sessionId,
    cwd,
    sourcePath: codexTranscriptPath(sourceHomeDir, `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
    modifiedAtMs,
    updatedAt: new Date(modifiedAtMs).toISOString(),
    branch: null,
    ...overrides,
  };
}

export function isPathInsideOrEqual(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel.length === 0 || (!rel.startsWith("..") && rel !== ".." && !rel.startsWith(`..${sep}`));
}
