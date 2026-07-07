import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  AGENT_RESUME_LIMITS,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  AGENT_SESSION_STORE,
  CODEX_SESSION_ORIGINATOR,
  CODEX_SESSION_THREAD_SOURCE,
} from "@/domains/agent/protocol";
import {
  type AgentResumeCandidate,
  type AgentSessionDirEntry,
  type AgentSessionFileSystem,
  claudeProjectDirName,
  isPathInsideOrEqual,
} from "@/domains/agent/resume";
import { createAgentDomain } from "@/interfaces/cli/agent";
import {
  type AgentResumePickerResult,
  quitAgentResumePicker,
  selectedAgentResumeCandidate,
} from "@/interfaces/cli/agent/resume/run-picker";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  arbitraryAgentLaunchExitCode,
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeRecentOffsetMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";

export { isPathInsideOrEqual };

export interface TranscriptInput {
  readonly sessionId: string;
  readonly cwd: string;
  readonly timestamp: string;
  readonly branch?: string;
  readonly originator?: string;
  readonly threadSource?: string;
  readonly padToBytes?: number;
}

export class ImmediateExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

export interface ResumeFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly worktreeRoot: string;
  readonly cwd: string;
  readonly nowMs: number;
  readonly newestSessionId: string;
  readonly olderSessionId: string;
  readonly olderModifiedAtMs: number;
}

export interface AgentResumeDiscoveryFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly nowMs: number;
  readonly homeDir: string;
  readonly worktreeRoot: string;
  readonly cwd: string;
}

interface ResumeProgramInput {
  readonly fs: AgentSessionFileSystem;
  readonly homeDir: string;
  readonly cwd: string;
  readonly nowMs: number;
  readonly isInteractiveTerminal: () => boolean;
  readonly resolveWorktreeRoot: (cwd: string, fallbackWorktreeRoot: string) => Promise<string>;
  readonly pickCandidate?: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
  readonly launchCandidate?: (candidate: AgentResumeCandidate) => Promise<number>;
  readonly writeStdout?: (output: string) => void;
  readonly writeStderr?: (output: string) => void;
  readonly setExitCode?: (exitCode: number) => void;
  readonly exit?: (exitCode: number) => never;
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
  private readonly headReadBytes = new Map<string, number>();
  private readonly tailReadBytes = new Map<string, number>();

  writeFile(path: string, content: string, mtimeMs: number): void {
    this.files.set(resolve(path), { content, mtimeMs });
  }

  maxHeadReadBytes(path: string): number {
    return this.headReadBytes.get(resolve(path)) ?? 0;
  }

  maxTailReadBytes(path: string): number {
    return this.tailReadBytes.get(resolve(path)) ?? 0;
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

  async readHead(path: string, maxBytes: number): Promise<string> {
    const resolved = resolve(path);
    this.headReadBytes.set(resolved, Math.max(this.maxHeadReadBytes(resolved), maxBytes));
    const file = this.files.get(resolved);
    if (file === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    return Buffer.from(file.content, "utf8").subarray(0, maxBytes).toString("utf8");
  }

  async readTail(path: string, maxBytes: number): Promise<string> {
    const resolved = resolve(path);
    this.tailReadBytes.set(resolved, Math.max(this.maxTailReadBytes(resolved), maxBytes));
    const file = this.files.get(resolved);
    if (file === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    const content = Buffer.from(file.content, "utf8");
    const start = Math.max(0, content.length - maxBytes);
    return content.subarray(start).toString("utf8");
  }

  async readText(path: string): Promise<string> {
    const file = this.files.get(resolve(path));
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

const TRANSCRIPT_PAD_FILLER = "x";

function withTranscriptPadding(head: string, padToBytes: number | undefined): string {
  if (padToBytes === undefined) {
    return head;
  }
  const fillerLength = Math.max(0, padToBytes - head.length - 1);
  return `${head}\n${TRANSCRIPT_PAD_FILLER.repeat(fillerLength)}`;
}

export function codexTranscript(input: TranscriptInput): string {
  return withTranscriptPadding(codexTranscriptMeta(input, input.timestamp), input.padToBytes);
}

export function codexTranscriptWithoutTimestamp(input: Omit<TranscriptInput, "timestamp">): string {
  return withTranscriptPadding(codexTranscriptMeta(input, undefined), input.padToBytes);
}

function codexTranscriptMeta(input: Omit<TranscriptInput, "timestamp">, timestamp: string | undefined): string {
  const payload: Record<string, unknown> = {
    [AGENT_SESSION_JSON_FIELDS.SESSION_ID]: input.sessionId,
    [AGENT_SESSION_JSON_FIELDS.CWD]: input.cwd,
    [AGENT_SESSION_JSON_FIELDS.ORIGINATOR]: input.originator ?? CODEX_SESSION_ORIGINATOR.TUI,
    [AGENT_SESSION_JSON_FIELDS.GIT]: { [AGENT_SESSION_JSON_FIELDS.BRANCH]: input.branch ?? null },
  };
  if (input.threadSource !== undefined) {
    payload[AGENT_SESSION_JSON_FIELDS.THREAD_SOURCE] = input.threadSource;
  }
  return JSON.stringify({
    ...(timestamp === undefined ? {} : { [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: timestamp }),
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_SESSION_META,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: payload,
  });
}

export function codexSubagentTranscript(input: TranscriptInput): string {
  return codexTranscript({ ...input, threadSource: CODEX_SESSION_THREAD_SOURCE.SUBAGENT });
}

export function agentSessionJsonlName(sessionId: string): string {
  return `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`;
}

export function agentResumeWorktreeRootResolver(worktreeRoot: string): (cwd: string) => Promise<string> {
  return async (candidateCwd) => (isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : candidateCwd);
}

export function agentResumeFixedWorktreeRootResolver(worktreeRoot: string): () => Promise<string> {
  return async () => worktreeRoot;
}

export function agentResumeMultiRootResolver(...worktreeRoots: readonly string[]): (cwd: string) => Promise<string> {
  return async (candidateCwd) => worktreeRoots.find((root) => isPathInsideOrEqual(root, candidateCwd)) ?? candidateCwd;
}

export interface RecordingAgentResumeWorktreeRootResolver {
  readonly resolve: (cwd: string) => Promise<string>;
  readonly callCount: () => number;
}

export function recordingAgentResumeWorktreeRootResolver(
  worktreeRoot: string,
): RecordingAgentResumeWorktreeRootResolver {
  let calls = 0;
  return {
    resolve: async (candidateCwd) => {
      calls += 1;
      return isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : candidateCwd;
    },
    callCount: () => calls,
  };
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

interface TranscriptFileInput extends TranscriptInput {
  readonly marker?: string;
  readonly modifiedAtMs: number;
}

interface TranscriptWriteInput {
  readonly marker?: string;
  readonly modifiedAtMs: number;
}

function appendTranscriptMarker(transcript: string, marker: string | undefined): string {
  return marker === undefined ? transcript : `${transcript}\n${marker}`;
}

function writeTranscriptFile(
  fs: MemoryAgentSessionFileSystem,
  path: string,
  transcript: string,
  input: TranscriptWriteInput,
): string {
  fs.writeFile(path, appendTranscriptMarker(transcript, input.marker), input.modifiedAtMs);
  return path;
}

export function writeCodexTranscriptFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: TranscriptFileInput,
): string {
  return writeTranscriptFile(
    fs,
    codexTranscriptPath(homeDir, agentSessionJsonlName(input.sessionId)),
    codexTranscript(input),
    input,
  );
}

export function writeCodexSubagentTranscriptFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: TranscriptFileInput,
): string {
  return writeTranscriptFile(
    fs,
    codexTranscriptPath(homeDir, agentSessionJsonlName(input.sessionId)),
    codexSubagentTranscript(input),
    input,
  );
}

export function writeCodexTranscriptWithoutTimestampFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: Omit<TranscriptFileInput, "timestamp">,
): string {
  return writeTranscriptFile(
    fs,
    codexTranscriptPath(homeDir, agentSessionJsonlName(input.sessionId)),
    codexTranscriptWithoutTimestamp(input),
    input,
  );
}

export function writeCodexTranscriptWithPartialTailFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: TranscriptFileInput,
): string {
  const partialRow = "x".repeat(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES * 2);
  return writeTranscriptFile(
    fs,
    codexTranscriptPath(homeDir, agentSessionJsonlName(input.sessionId)),
    [codexTranscript(input), partialRow].join("\n"),
    input,
  );
}

export function claudeCodeTranscript(input: TranscriptInput): string {
  const row = JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: input.timestamp,
    [AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL]: input.sessionId,
    [AGENT_SESSION_JSON_FIELDS.CWD]: input.cwd,
    [AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]: input.branch ?? null,
  });
  return withTranscriptPadding(row, input.padToBytes);
}

export function agentTranscriptActivityRow(timestamp: string): string {
  return JSON.stringify({ [AGENT_SESSION_JSON_FIELDS.TIMESTAMP]: timestamp });
}

export function claudeProjectTranscriptPath(homeDir: string, cwd: string, fileName: string): string {
  return join(
    homeDir,
    AGENT_SESSION_STORE.CLAUDE_DIR,
    AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
    claudeProjectDirName(cwd),
    fileName,
  );
}

export function writeClaudeProjectTranscriptFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: TranscriptFileInput,
): string {
  return writeTranscriptFile(
    fs,
    claudeProjectTranscriptPath(homeDir, input.cwd, agentSessionJsonlName(input.sessionId)),
    claudeCodeTranscript(input),
    input,
  );
}

export function writeClaudeSubagentTranscriptFile(
  fs: MemoryAgentSessionFileSystem,
  homeDir: string,
  input: TranscriptFileInput,
): string {
  return writeTranscriptFile(
    fs,
    claudeSubagentTranscriptPath(homeDir, input.cwd, agentSessionJsonlName(input.sessionId)),
    claudeCodeTranscript(input),
    input,
  );
}

export function claudeSubagentTranscriptPath(homeDir: string, cwd: string, fileName: string): string {
  return join(
    homeDir,
    AGENT_SESSION_STORE.CLAUDE_DIR,
    AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
    claudeProjectDirName(cwd),
    AGENT_SESSION_STORE.CLAUDE_SUBAGENTS_DIR,
    fileName,
  );
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
    lastActivityAtMs: modifiedAtMs,
    updatedAt: new Date(modifiedAtMs).toISOString(),
    branch: null,
    ...overrides,
  };
}

export function createResumeFixture(): ResumeFixture {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 2);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
  const timestamp = new Date(nowMs).toISOString();
  const newestSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 3);
  const olderSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 4);
  const olderModifiedAtMs = nowMs - sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 5);
  const olderTimestamp = new Date(olderModifiedAtMs).toISOString();

  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(newestSessionId)),
    codexTranscript({ sessionId: newestSessionId, cwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(olderSessionId)),
    codexTranscript({ sessionId: olderSessionId, cwd, timestamp: olderTimestamp }),
    olderModifiedAtMs,
  );

  return { fs, homeDir, worktreeRoot, cwd, nowMs, newestSessionId, olderSessionId, olderModifiedAtMs };
}

export function createAgentResumeDiscoveryFixture(seedOffset: number): AgentResumeDiscoveryFixture {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), seedOffset);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), seedOffset + 1);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), seedOffset + 2);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), seedOffset + 3);
  return { fs, nowMs, homeDir, worktreeRoot, cwd };
}

export function createProgramForResumeFixture(
  fixture: ResumeFixture,
  options: {
    readonly pickCandidate?: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
    readonly launchCandidate?: (candidate: AgentResumeCandidate) => Promise<number>;
    readonly writeStdout?: (output: string) => void;
    readonly writeStderr?: (output: string) => void;
    readonly setExitCode?: (exitCode: number) => void;
    readonly exit?: (exitCode: number) => never;
    readonly resolveWorktreeRoot?: (cwd: string, fallbackWorktreeRoot: string) => Promise<string>;
  } = {},
): ReturnType<typeof createCliProgram> {
  return createResumeProgram({
    fs: fixture.fs,
    homeDir: fixture.homeDir,
    cwd: fixture.cwd,
    nowMs: fixture.nowMs,
    isInteractiveTerminal: () => true,
    resolveWorktreeRoot: options.resolveWorktreeRoot
      ?? (async (candidateCwd, fallbackWorktreeRoot) =>
        isPathInsideOrEqual(fixture.worktreeRoot, candidateCwd) ? fixture.worktreeRoot : fallbackWorktreeRoot),
    pickCandidate: options.pickCandidate ?? pickFirstResumeCandidate,
    launchCandidate: options.launchCandidate ?? (async () => sampleAgentResumeValue(arbitraryAgentLaunchExitCode(), 6)),
    writeStdout: options.writeStdout,
    writeStderr: options.writeStderr,
    setExitCode: options.setExitCode,
    exit: options.exit ?? ((exitCode) => {
      throw new ImmediateExit(exitCode);
    }),
  });
}

export function createInteractiveResumeProgram(input: {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly cwd: string;
  readonly nowMs: number;
  readonly resolveWorktreeRoot: (cwd: string, fallbackWorktreeRoot: string) => Promise<string>;
  readonly pickCandidate?: (candidates: readonly AgentResumeCandidate[]) => Promise<AgentResumePickerResult>;
  readonly launchCandidate?: (candidate: AgentResumeCandidate) => Promise<number>;
  readonly writeStdout?: (output: string) => void;
  readonly writeStderr?: (output: string) => void;
  readonly setExitCode?: (exitCode: number) => void;
  readonly exit?: (exitCode: number) => never;
}): ReturnType<typeof createCliProgram> {
  return createResumeProgram({
    fs: input.fs,
    homeDir: input.homeDir,
    cwd: input.cwd,
    nowMs: input.nowMs,
    isInteractiveTerminal: () => true,
    resolveWorktreeRoot: input.resolveWorktreeRoot,
    pickCandidate: input.pickCandidate,
    launchCandidate: input.launchCandidate,
    writeStdout: input.writeStdout,
    writeStderr: input.writeStderr,
    setExitCode: input.setExitCode,
    exit: input.exit,
  });
}

export function createNonInteractiveResumeProgram(input: {
  readonly productDir: string;
  readonly writeStdout: (output: string) => void;
  readonly writeStderr: (output: string) => void;
  readonly exit: (exitCode: number) => never;
}): ReturnType<typeof createCliProgram> {
  return createResumeProgram({
    fs: discoveryRefusalFileSystem(),
    homeDir: input.productDir,
    cwd: input.productDir,
    nowMs: Date.now(),
    isInteractiveTerminal: () => false,
    resolveWorktreeRoot: agentResumeFixedWorktreeRootResolver(input.productDir),
    writeStdout: input.writeStdout,
    writeStderr: input.writeStderr,
    exit: input.exit,
  });
}

async function pickFirstResumeCandidate(
  candidates: readonly AgentResumeCandidate[],
): Promise<AgentResumePickerResult> {
  const candidate = candidates.at(0);
  return candidate === undefined ? quitAgentResumePicker() : selectedAgentResumeCandidate(candidate);
}

function createResumeProgram(input: ResumeProgramInput): ReturnType<typeof createCliProgram> {
  return createCliProgram({
    domains: [
      createAgentDomain({
        isInteractiveTerminal: input.isInteractiveTerminal,
        resumeDeps: {
          fs: input.fs,
          homeDir: () => input.homeDir,
          nowMs: () => input.nowMs,
          resolveWorktreeRoot: input.resolveWorktreeRoot,
        },
        pickCandidate: input.pickCandidate,
        launchCandidate: input.launchCandidate,
      }),
    ],
    processCwd: () => input.cwd,
    writeStdout: input.writeStdout,
    writeStderr: input.writeStderr,
    setExitCode: input.setExitCode,
    exit: input.exit,
  });
}

function discoveryRefusalFileSystem(): AgentSessionFileSystem {
  return {
    readDir: async () => refuseDiscovery(),
    readHead: async () => refuseDiscovery(),
    readTail: async () => refuseDiscovery(),
    stat: async () => refuseDiscovery(),
  };
}

function refuseDiscovery(): never {
  throw new Error("discovery should not run for non-interactive refusal");
}
