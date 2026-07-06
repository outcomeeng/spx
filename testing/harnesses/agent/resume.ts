import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { expect } from "vitest";

import { listAgentResumeSessions } from "@/commands/agent/resume";
import { jsonAgentSearchSessions } from "@/commands/agent/search";
import {
  AGENT_HOME_ENV,
  type AgentHomeDirs,
  agentHomeDirsFromHomeDir,
  resolveAgentHomeDirs,
} from "@/domains/agent/home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  AGENT_SESSION_STORE,
  CODEX_SESSION_ORIGINATOR,
  CODEX_SESSION_THREAD_SOURCE,
} from "@/domains/agent/protocol";
import {
  type AgentResumeCandidate,
  type AgentResumeSessionFileSystem,
  type AgentSessionDirEntry,
  branchResumeScope,
  claudeCodeSessionStoreDir,
  claudeProjectDirName,
  codexSessionStoreDir,
  discoverAgentResumeCandidates,
  isPathInsideOrEqual,
  worktreeResumeScope,
} from "@/domains/agent/resume";
import { agentSearchQueryFromOptions } from "@/domains/agent/search";
import { createAgentDomain } from "@/interfaces/cli/agent";
import {
  type AgentResumePickerResult,
  quitAgentResumePicker,
  selectedAgentResumeCandidate,
} from "@/interfaces/cli/agent/resume/run-picker";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  arbitraryAgentBranch,
  arbitraryAgentLaunchExitCode,
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeOverCapCount,
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
  readonly fs: AgentResumeSessionFileSystem;
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
const CONFIGURED_AGENT_HOME_SAMPLE = {
  DEFAULT_HOME: 401,
  CODEX_HOME: 402,
  CLAUDE_HOME: 403,
  WORKTREE_ROOT: 404,
  CODEX_CWD: 405,
  CLAUDE_CWD: 406,
  CODEX_SESSION_ID: 407,
  CLAUDE_SESSION_ID: 408,
  DEFAULT_SESSION_ID: 409,
  NOW_MS: 410,
} as const;

export class MemoryAgentSessionFileSystem implements AgentResumeSessionFileSystem {
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
  return codexTranscriptPathFromAgentHome(agentHomeDirsFromHomeDir(homeDir).codex, fileName);
}

function codexTranscriptPathFromAgentHome(codexHomeDir: string, fileName: string): string {
  return join(
    codexSessionStoreDir(codexHomeDir),
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
  return claudeProjectTranscriptPathFromAgentHome(agentHomeDirsFromHomeDir(homeDir).claudeCode, cwd, fileName);
}

function claudeProjectTranscriptPathFromAgentHome(claudeCodeHomeDir: string, cwd: string, fileName: string): string {
  return join(
    claudeCodeSessionStoreDir(claudeCodeHomeDir),
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
    claudeCodeSessionStoreDir(agentHomeDirsFromHomeDir(homeDir).claudeCode),
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

export async function assertResumeListOrdersByTranscriptActivityAcrossAgents(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 230);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 231);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 232);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 233);
  const newestSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 234);
  const olderSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 235);
  const olderModifiedAtMs = nowMs - sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 236);
  const staleOpeningTimestamp = new Date(olderModifiedAtMs).toISOString();
  const newestActivityTimestamp = new Date(nowMs).toISOString();
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, cwd, agentSessionJsonlName(newestSessionId)),
    [
      claudeCodeTranscript({ sessionId: newestSessionId, cwd, timestamp: staleOpeningTimestamp }),
      agentTranscriptActivityRow(newestActivityTimestamp),
    ].join("\n"),
    olderModifiedAtMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(olderSessionId)),
    codexTranscript({ sessionId: olderSessionId, cwd, timestamp: staleOpeningTimestamp }),
    nowMs,
  );

  const output = await listAgentResumeSessions({
    cwd,
    fallbackWorktreeRoot: worktreeRoot,
    scope: worktreeResumeScope(),
    deps: {
      fs,
      agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
      nowMs: () => nowMs,
      resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
    },
  });

  const [firstLine, secondLine] = output.split("\n");
  expect(firstLine).toContain(newestActivityTimestamp);
  expect(firstLine).toContain(newestSessionId);
  expect(secondLine).toContain(staleOpeningTimestamp);
  expect(secondLine).toContain(olderSessionId);
}

export async function assertNewestSessionsPerAgentWithinScope(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 2);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 3);
  const codexCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 4);
  const claudeCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 5);
  const cap = AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES;

  const codexIds: string[] = [];
  for (let index = 0; index < codexCount; index += 1) {
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 10 + index);
    codexIds.push(sessionId);
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId)),
      codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
      nowMs - index,
    );
  }
  const claudeIds: string[] = [];
  for (let index = 0; index < claudeCount; index += 1) {
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 40 + index);
    claudeIds.push(sessionId);
    fs.writeFile(
      claudeProjectTranscriptPath(homeDir, cwd, agentSessionJsonlName(sessionId)),
      claudeCodeTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
      nowMs - index,
    );
  }

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  const codexResult = candidates.filter((candidate) => candidate.agent === AGENT_SESSION_KIND.CODEX);
  const claudeResult = candidates.filter((candidate) => candidate.agent === AGENT_SESSION_KIND.CLAUDE_CODE);
  expect(codexResult.map((candidate) => candidate.sessionId)).toEqual(codexIds.slice(0, cap));
  expect(claudeResult.map((candidate) => candidate.sessionId)).toEqual(claudeIds.slice(0, cap));
  const timestampedActivity = candidates
    .map((candidate) => candidate.lastActivityAtMs)
    .filter((activityAtMs): activityAtMs is number => activityAtMs !== null);
  expect(timestampedActivity).toEqual([...timestampedActivity].sort((left, right) => right - left));
}

export async function assertInvocationWorktreeRootResolvedOnce(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 70);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 71);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 72);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 73);
  const sessionCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 74);
  for (let index = 0; index < sessionCount; index += 1) {
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 80 + index);
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId)),
      codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs - index).toISOString() }),
      nowMs - index,
    );
  }
  const resolver = recordingAgentResumeWorktreeRootResolver(worktreeRoot);

  await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: resolver.resolve,
  });

  expect(resolver.callCount()).toBe(1);
}

export async function assertBoundedMetadataHeadAndActivityTailWindows(): Promise<void> {
  const { fs, nowMs, homeDir, worktreeRoot, cwd } = createAgentResumeDiscoveryFixture(90);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 94);
  const transcriptPath = codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId));
  const oversizeBytes = AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES * 2;
  fs.writeFile(
    transcriptPath,
    codexTranscript({ sessionId, cwd, timestamp: new Date(nowMs).toISOString(), padToBytes: oversizeBytes }),
    nowMs,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
  expect(fs.maxHeadReadBytes(transcriptPath)).toBeLessThanOrEqual(AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES);
  expect(fs.maxTailReadBytes(transcriptPath)).toBeLessThanOrEqual(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES);
}

export async function assertUnknownActivityFillsRemainingCapSlots(): Promise<void> {
  const { fs, nowMs, homeDir, worktreeRoot, cwd } = createAgentResumeDiscoveryFixture(320);
  const cap = AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES;
  const timestampedIds = Array.from(
    { length: cap - 1 },
    (_, index) => sampleAgentResumeValue(arbitraryAgentSessionId(), 321 + index),
  );
  const unknownActivityIds = Array.from(
    { length: 2 },
    (_, index) => sampleAgentResumeValue(arbitraryAgentSessionId(), 330 + index),
  );

  for (const [index, sessionId] of timestampedIds.entries()) {
    const activityAtMs = nowMs - index - 1;
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId)),
      codexTranscript({ sessionId, cwd, timestamp: new Date(activityAtMs).toISOString() }),
      activityAtMs,
    );
  }
  for (const [index, sessionId] of unknownActivityIds.entries()) {
    writeCodexTranscriptWithoutTimestampFile(fs, homeDir, {
      sessionId,
      cwd,
      modifiedAtMs: nowMs - index,
    });
  }

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });
  const codexResult = candidates.filter((candidate) => candidate.agent === AGENT_SESSION_KIND.CODEX);

  expect(codexResult).toHaveLength(cap);
  expect(codexResult.slice(0, cap - 1).map((candidate) => [candidate.sessionId, candidate.lastActivityAtMs])).toEqual(
    timestampedIds.map((sessionId, index) => [sessionId, nowMs - index - 1]),
  );
  expect(codexResult.at(-1)?.lastActivityAtMs).toBeNull();
  expect(unknownActivityIds).toContain(codexResult.at(-1)?.sessionId);
}

export async function assertTimestamplessSessionSortsAfterTimestamped(): Promise<void> {
  const { fs, nowMs, homeDir, worktreeRoot, cwd } = createAgentResumeDiscoveryFixture(290);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 294);
  const timestampedId = sampleAgentResumeValue(arbitraryAgentSessionId(), 295);
  writeCodexTranscriptWithoutTimestampFile(fs, homeDir, { sessionId, cwd, modifiedAtMs: nowMs });
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(timestampedId)),
    codexTranscript({ sessionId: timestampedId, cwd, timestamp: new Date(nowMs - 1).toISOString() }),
    nowMs - 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => [candidate.sessionId, candidate.lastActivityAtMs])).toEqual([
    [timestampedId, nowMs - 1],
    [sessionId, null],
  ]);
}

export async function assertPartialTailSessionSortsAfterTimestamped(): Promise<void> {
  const { fs, nowMs, homeDir, worktreeRoot, cwd } = createAgentResumeDiscoveryFixture(300);
  const activeId = sampleAgentResumeValue(arbitraryAgentSessionId(), 304);
  const olderId = sampleAgentResumeValue(arbitraryAgentSessionId(), 305);
  const openingTimestamp = new Date(nowMs - AGENT_RESUME_RECENT_WINDOW_MS + 1).toISOString();
  const olderTimestamp = new Date(nowMs - sampleAgentResumeValue(arbitraryAgentResumeRecentOffsetMs(), 306))
    .toISOString();
  writeCodexTranscriptWithPartialTailFile(fs, homeDir, {
    sessionId: activeId,
    cwd,
    timestamp: openingTimestamp,
    modifiedAtMs: nowMs,
  });
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(olderId)),
    codexTranscript({ sessionId: olderId, cwd, timestamp: olderTimestamp }),
    nowMs - 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => [candidate.sessionId, candidate.lastActivityAtMs])).toEqual([
    [olderId, Date.parse(olderTimestamp)],
    [activeId, null],
  ]);
}

export async function assertDeduplicatesSharedSessionIdToNewestActivity(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 110);
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 111);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 112);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 113);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 114);
  const rolloutCount = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 115);
  let newestActivityAtMs = 0;
  for (let index = 0; index < rolloutCount; index += 1) {
    const rolloutId = sampleAgentResumeValue(arbitraryAgentSessionId(), 120 + index);
    const mtimeMs = nowMs - index;
    const activityAtMs = nowMs - rolloutCount + index;
    newestActivityAtMs = Math.max(newestActivityAtMs, activityAtMs);
    fs.writeFile(
      codexTranscriptPath(homeDir, agentSessionJsonlName(rolloutId)),
      codexTranscript({ sessionId, cwd, timestamp: new Date(activityAtMs).toISOString() }),
      mtimeMs,
    );
  }

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => [candidate.sessionId, candidate.lastActivityAtMs])).toEqual([
    [sessionId, newestActivityAtMs],
  ]);
}

export async function assertDedupKeepsInScopeSessionWhenNewerDuplicateOutOfScope(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 220);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 221);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 222);
  const siblingRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 223);
  const inScopeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 224);
  const outOfScopeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 225);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 226);
  const newerFile = sampleAgentResumeValue(arbitraryAgentSessionId(), 227);
  const olderFile = sampleAgentResumeValue(arbitraryAgentSessionId(), 228);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(newerFile)),
    codexTranscript({ sessionId, cwd: outOfScopeCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(olderFile)),
    codexTranscript({ sessionId, cwd: inScopeCwd, timestamp }),
    nowMs - 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: inScopeCwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeMultiRootResolver(worktreeRoot, siblingRoot),
  });

  expect(candidates.map((candidate) => [candidate.sessionId, candidate.cwd])).toEqual([[sessionId, inScopeCwd]]);
}

export async function assertExcludesNonInteractiveCodexTranscripts(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 140);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 141);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 142);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 143);
  const interactiveId = sampleAgentResumeValue(arbitraryAgentSessionId(), 144);
  const execId = sampleAgentResumeValue(arbitraryAgentSessionId(), 145);
  const subagentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 146);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(interactiveId)),
    codexTranscript({ sessionId: interactiveId, cwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(execId)),
    codexTranscript({ sessionId: execId, cwd, timestamp, originator: CODEX_SESSION_ORIGINATOR.EXEC }),
    nowMs - 1,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(subagentId)),
    codexSubagentTranscript({ sessionId: subagentId, cwd, timestamp }),
    nowMs - 2,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([interactiveId]);
}

export async function assertExcludesClaudeSubagentTranscripts(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 160);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 161);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 162);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 163);
  const topLevelId = sampleAgentResumeValue(arbitraryAgentSessionId(), 164);
  const subagentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 165);
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, cwd, agentSessionJsonlName(topLevelId)),
    claudeCodeTranscript({ sessionId: topLevelId, cwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    claudeSubagentTranscriptPath(homeDir, cwd, agentSessionJsonlName(subagentId)),
    claudeCodeTranscript({ sessionId: subagentId, cwd, timestamp }),
    nowMs - 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([topLevelId]);
}

export async function assertIncludesCodexVsCodeTranscripts(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 250);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 251);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 252);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 253);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 254);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId)),
    codexTranscript({ sessionId, cwd, timestamp, originator: CODEX_SESSION_ORIGINATOR.VSCODE }),
    nowMs,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
}

export async function assertExcludesStaleModifiedSessions(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 180);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 181);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 182);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 183);
  const recentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 184);
  const staleId = sampleAgentResumeValue(arbitraryAgentSessionId(), 185);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(recentId)),
    codexTranscript({ sessionId: recentId, cwd, timestamp }),
    nowMs,
  );
  const staleTranscriptPath = codexTranscriptPath(homeDir, agentSessionJsonlName(staleId));
  fs.writeFile(
    staleTranscriptPath,
    codexTranscript({ sessionId: staleId, cwd, timestamp }),
    nowMs - AGENT_RESUME_RECENT_WINDOW_MS - 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([recentId]);
  expect(fs.maxTailReadBytes(staleTranscriptPath)).toBe(0);
}

export async function assertExcludesFutureModifiedSessions(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 210);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 211);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 212);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 213);
  const recentId = sampleAgentResumeValue(arbitraryAgentSessionId(), 214);
  const futureId = sampleAgentResumeValue(arbitraryAgentSessionId(), 215);
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(recentId)),
    codexTranscript({ sessionId: recentId, cwd, timestamp }),
    nowMs,
  );
  const futureTranscriptPath = codexTranscriptPath(homeDir, agentSessionJsonlName(futureId));
  fs.writeFile(
    futureTranscriptPath,
    codexTranscript({ sessionId: futureId, cwd, timestamp }),
    nowMs + 1,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([recentId]);
  expect(fs.maxHeadReadBytes(futureTranscriptPath)).toBe(0);
  expect(fs.maxTailReadBytes(futureTranscriptPath)).toBe(0);
}

export async function assertSkipsClaudeSiblingProjectPrefix(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 200);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 201);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 202);
  const siblingRoot = `${worktreeRoot}extra`;
  const invocationCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 203);
  const insideId = sampleAgentResumeValue(arbitraryAgentSessionId(), 204);
  const siblingCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(siblingRoot), 205);
  const siblingId = sampleAgentResumeValue(arbitraryAgentSessionId(), 206);
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, invocationCwd, agentSessionJsonlName(insideId)),
    claudeCodeTranscript({ sessionId: insideId, cwd: invocationCwd, timestamp }),
    nowMs,
  );
  const siblingTranscriptPath = claudeProjectTranscriptPath(homeDir, siblingCwd, agentSessionJsonlName(siblingId));
  fs.writeFile(
    siblingTranscriptPath,
    claudeCodeTranscript({ sessionId: siblingId, cwd: siblingCwd, timestamp }),
    nowMs,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: invocationCwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([insideId]);
  expect(fs.maxHeadReadBytes(siblingTranscriptPath)).toBe(0);
}

export async function assertSourcePathTieBreakSelectsPerAgentCap(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 260);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 261);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 262);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 263);
  const total = sampleAgentResumeValue(arbitraryAgentResumeOverCapCount(), 264);
  const written: { readonly sessionId: string; readonly path: string }[] = [];
  for (let index = 0; index < total; index += 1) {
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 270 + index);
    const path = codexTranscriptPath(homeDir, agentSessionJsonlName(sessionId));
    written.push({ sessionId, path });
    fs.writeFile(path, codexTranscript({ sessionId, cwd, timestamp }), nowMs);
  }
  const expected = [...written]
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES)
    .map((entry) => entry.sessionId);

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: worktreeResumeScope(),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(new Set(candidates.map((candidate) => candidate.sessionId))).toEqual(new Set(expected));
}

export async function assertClaudeBranchReadFromLaterHeadRow(): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), 240);
  const timestamp = new Date(nowMs).toISOString();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 241);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 242);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 243);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 244);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), 245);
  fs.writeFile(
    claudeProjectTranscriptPath(homeDir, cwd, agentSessionJsonlName(sessionId)),
    [
      claudeCodeTranscript({ sessionId, cwd, timestamp }),
      claudeCodeTranscript({ sessionId, cwd, timestamp, branch: targetBranch }),
    ].join("\n"),
    nowMs,
  );

  const candidates = await discoverAgentResumeCandidates({
    invocationDir: cwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    scope: branchResumeScope(targetBranch),
    fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(worktreeRoot),
  });

  expect(candidates.map((candidate) => candidate.sessionId)).toEqual([sessionId]);
}

export function assertClaudeProjectNameEncodesPathSeparators(): void {
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 280)),
    281,
  );
  const posixEncoded = claudeProjectDirName(cwd);
  const windowsEncoded = claudeProjectDirName(cwd.replaceAll("/", "\\"));

  expect(posixEncoded.includes("/")).toBe(false);
  expect(windowsEncoded.includes("\\")).toBe(false);
  expect(windowsEncoded).toBe(posixEncoded);
}

export function assertDefaultAgentSessionStoreDirs(): void {
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());

  const agentHomeDirs = agentHomeDirsFromHomeDir(homeDir);
  expect(codexSessionStoreDir(agentHomeDirs.codex)).toBe(
    join(homeDir, AGENT_SESSION_STORE.CODEX_DIR, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR),
  );
  expect(claudeCodeSessionStoreDir(agentHomeDirs.claudeCode)).toBe(
    join(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR),
  );
}

export function assertAgentHomeResolutionHonorsEnvironment(): void {
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_HOME);
  const configuredCodexHome = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    CONFIGURED_AGENT_HOME_SAMPLE.CODEX_HOME,
  );
  const configuredClaudeHome = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_HOME,
  );
  const resolved = resolveAgentHomeDirs(
    {
      [AGENT_HOME_ENV.CODEX]: configuredCodexHome,
      [AGENT_HOME_ENV.CLAUDE]: configuredClaudeHome,
    },
    { homeDir: () => defaultHome },
  );

  expect(resolved).toEqual({
    codex: configuredCodexHome,
    claudeCode: configuredClaudeHome,
  });
}

export function assertAgentHomeResolutionUsesDefaultHomes(): void {
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_HOME);

  expect(resolveAgentHomeDirs({}, { homeDir: () => defaultHome })).toEqual(agentHomeDirsFromHomeDir(defaultHome));
}

export async function assertAgentResumeUsesConfiguredAgentHomes(): Promise<void> {
  const fixture = createConfiguredAgentHomeFixture();
  const output = await listAgentResumeSessions({
    cwd: fixture.codexCwd,
    fallbackWorktreeRoot: fixture.worktreeRoot,
    scope: worktreeResumeScope(),
    deps: {
      fs: fixture.fs,
      agentHomeDirs: () => fixture.agentHomeDirs,
      nowMs: () => fixture.nowMs,
      resolveWorktreeRoot: async () => fixture.worktreeRoot,
    },
  });

  expect(output).toContain(fixture.codexSessionId);
  expect(output).toContain(fixture.claudeSessionId);
  expect(output).not.toContain(fixture.defaultSessionId);
}

export async function assertAgentSearchUsesConfiguredAgentHomes(): Promise<void> {
  const fixture = createConfiguredAgentHomeFixture();
  const output = await jsonAgentSearchSessions({
    cwd: fixture.codexCwd,
    fallbackProductScopeRoot: fixture.worktreeRoot,
    query: agentSearchQueryFromOptions({}),
    deps: {
      fs: fixture.fs,
      agentHomeDirs: () => fixture.agentHomeDirs,
      nowMs: () => fixture.nowMs,
      resolveProductScopeRoot: async () => fixture.worktreeRoot,
      resolveBranchAssociatedWorktreeRoots: async () => [],
    },
  });

  expect(output).toContain(fixture.codexSessionId);
  expect(output).toContain(fixture.claudeSessionId);
  expect(output).not.toContain(fixture.defaultSessionId);
}

interface ConfiguredAgentHomeFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly agentHomeDirs: AgentHomeDirs;
  readonly worktreeRoot: string;
  readonly codexCwd: string;
  readonly claudeCwd: string;
  readonly codexSessionId: string;
  readonly claudeSessionId: string;
  readonly defaultSessionId: string;
  readonly nowMs: number;
}

function createConfiguredAgentHomeFixture(): ConfiguredAgentHomeFixture {
  const fs = new MemoryAgentSessionFileSystem();
  const defaultHome = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_HOME);
  const agentHomeDirs = {
    codex: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CODEX_HOME),
    claudeCode: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_HOME),
  };
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), CONFIGURED_AGENT_HOME_SAMPLE.WORKTREE_ROOT);
  const codexCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    CONFIGURED_AGENT_HOME_SAMPLE.CODEX_CWD,
  );
  const claudeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), CONFIGURED_AGENT_HOME_SAMPLE.NOW_MS);
  const codexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.CODEX_SESSION_ID,
  );
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.CLAUDE_SESSION_ID,
  );
  const defaultSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    CONFIGURED_AGENT_HOME_SAMPLE.DEFAULT_SESSION_ID,
  );
  const timestamp = new Date(nowMs).toISOString();

  fs.writeFile(
    codexTranscriptPathFromAgentHome(agentHomeDirs.codex, agentSessionJsonlName(codexSessionId)),
    codexTranscript({ sessionId: codexSessionId, cwd: codexCwd, timestamp }),
    nowMs,
  );
  fs.writeFile(
    claudeProjectTranscriptPathFromAgentHome(
      agentHomeDirs.claudeCode,
      claudeCwd,
      agentSessionJsonlName(claudeSessionId),
    ),
    claudeCodeTranscript({ sessionId: claudeSessionId, cwd: claudeCwd, timestamp }),
    nowMs,
  );
  writeCodexTranscriptFile(fs, defaultHome, {
    sessionId: defaultSessionId,
    cwd: codexCwd,
    timestamp,
    modifiedAtMs: nowMs,
  });

  return {
    fs,
    agentHomeDirs,
    worktreeRoot,
    codexCwd,
    claudeCwd,
    codexSessionId,
    claudeSessionId,
    defaultSessionId,
    nowMs,
  };
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
          agentHomeDirs: () => agentHomeDirsFromHomeDir(input.homeDir),
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

function discoveryRefusalFileSystem(): AgentResumeSessionFileSystem {
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
