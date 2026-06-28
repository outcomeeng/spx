import { resolve } from "node:path";

import {
  AGENT_RESUME_COMMAND,
  AGENT_RESUME_LIMITS,
  AGENT_RESUME_MODE,
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_RESUME_TEXT,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_LABEL,
  AGENT_SESSION_STORE,
  type AgentResumeMode,
  type AgentSessionKind,
} from "./protocol";

export interface AgentSessionDirEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
}

export interface AgentSessionFileStat {
  readonly mtimeMs: number;
}

export interface AgentSessionFileSystem {
  readDir(path: string): Promise<readonly AgentSessionDirEntry[]>;
  readFile(path: string): Promise<string>;
  stat(path: string): Promise<AgentSessionFileStat>;
}

export type AgentWorktreeRootResolver = (cwd: string) => Promise<string | null>;

export interface AgentResumeCandidate {
  readonly agent: AgentSessionKind;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly modifiedAtMs: number;
  readonly updatedAt: string | null;
  readonly branch: string | null;
}

export interface AgentResumeLaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface DiscoverAgentResumeCandidatesOptions {
  readonly invocationDir: string;
  readonly homeDir: string;
  readonly nowMs: number;
  readonly fs: AgentSessionFileSystem;
  readonly resolveWorktreeRoot: AgentWorktreeRootResolver;
}

export interface AgentResumeModeFlags {
  readonly latest?: boolean;
  readonly list?: boolean;
  readonly json?: boolean;
}

export class AgentResumeModeError extends Error {
  constructor(readonly selectedModes: readonly AgentResumeMode[]) {
    super(`${AGENT_RESUME_TEXT.MODE_CONFLICT}: ${selectedModes.join(", ")}`);
    this.name = "AgentResumeModeError";
  }
}

interface CandidateDraft {
  readonly agent: AgentSessionKind;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly modifiedAtMs: number;
  readonly updatedAt: string | null;
  readonly branch: string | null;
}

export function resolveAgentResumeMode(flags: AgentResumeModeFlags): AgentResumeMode {
  const selected: AgentResumeMode[] = [];
  if (flags.latest === true) selected.push(AGENT_RESUME_MODE.LATEST);
  if (flags.list === true) selected.push(AGENT_RESUME_MODE.LIST);
  if (flags.json === true) selected.push(AGENT_RESUME_MODE.JSON);
  if (selected.length > 1) {
    throw new AgentResumeModeError(selected);
  }
  return selected[0] ?? AGENT_RESUME_MODE.PICK;
}

export function codexSessionStoreDir(homeDir: string): string {
  return resolve(homeDir, AGENT_SESSION_STORE.CODEX_DIR, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR);
}

export function claudeCodeSessionStoreDir(homeDir: string): string {
  return resolve(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR);
}

export async function discoverAgentResumeCandidates(
  options: DiscoverAgentResumeCandidatesOptions,
): Promise<AgentResumeCandidate[]> {
  const invocationRoot = await options.resolveWorktreeRoot(options.invocationDir);
  if (invocationRoot === null) {
    return [];
  }

  const drafts = [
    ...(await discoverCodexResumeCandidates(
      codexSessionStoreDir(options.homeDir),
      options.fs,
      options.nowMs,
    )),
    ...(await discoverClaudeCodeResumeCandidates(
      claudeCodeSessionStoreDir(options.homeDir),
      options.fs,
      options.nowMs,
    )),
  ];

  const sortedDrafts = [...drafts];
  sortedDrafts.sort(compareCandidates);

  const rootResults = await mapWithConcurrency(
    sortedDrafts,
    AGENT_RESUME_LIMITS.ROOT_RESOLUTION_CONCURRENCY,
    async (candidate) => ({
      candidate,
      root: await options.resolveWorktreeRoot(candidate.cwd),
    }),
  );

  return rootResults
    .filter((result) => result.root !== null && samePath(result.root, invocationRoot))
    .map((result) => result.candidate)
    .slice(0, AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES);
}

export function buildAgentResumeLaunchCommand(candidate: AgentResumeCandidate): AgentResumeLaunchCommand {
  if (candidate.agent === AGENT_SESSION_KIND.CODEX) {
    return {
      command: AGENT_RESUME_COMMAND.CODEX_BINARY,
      args: [AGENT_RESUME_COMMAND.CODEX_RESUME, candidate.sessionId],
      cwd: candidate.cwd,
    };
  }
  return {
    command: AGENT_RESUME_COMMAND.CLAUDE_BINARY,
    args: [AGENT_RESUME_COMMAND.CLAUDE_RESUME, candidate.sessionId],
    cwd: candidate.cwd,
  };
}

export function renderAgentResumeList(candidates: readonly AgentResumeCandidate[]): string {
  if (candidates.length === 0) {
    return AGENT_RESUME_TEXT.NO_MATCHES;
  }
  return candidates.map((candidate) => {
    const updatedAt = candidate.updatedAt ?? new Date(candidate.modifiedAtMs).toISOString();
    return `${updatedAt} ${AGENT_SESSION_LABEL[candidate.agent]} ${candidate.sessionId} ${candidate.cwd}`;
  }).join("\n");
}

export function renderAgentResumeJson(candidates: readonly AgentResumeCandidate[]): string {
  return JSON.stringify(candidates, null, 2);
}

async function discoverCodexResumeCandidates(
  root: string,
  fs: AgentSessionFileSystem,
  nowMs: number,
): Promise<CandidateDraft[]> {
  return discoverStoreCandidates(root, fs, nowMs, parseCodexCandidateFile);
}

async function discoverClaudeCodeResumeCandidates(
  root: string,
  fs: AgentSessionFileSystem,
  nowMs: number,
): Promise<CandidateDraft[]> {
  return discoverStoreCandidates(root, fs, nowMs, parseClaudeCodeCandidateFile);
}

async function discoverStoreCandidates(
  root: string,
  fs: AgentSessionFileSystem,
  nowMs: number,
  parseCandidate: (sourcePath: string, content: string, modifiedAtMs: number) => CandidateDraft | null,
): Promise<CandidateDraft[]> {
  const files = await collectJsonlFiles(root, fs);
  const candidates: CandidateDraft[] = [];
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (stat === null || !isRecentAgentSessionMtime(stat.mtimeMs, nowMs)) {
      continue;
    }
    const content = await fs.readFile(file).catch(() => null);
    if (content === null) {
      continue;
    }
    const candidate = parseCandidate(file, content, stat.mtimeMs);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function collectJsonlFiles(root: string, fs: AgentSessionFileSystem): Promise<string[]> {
  const entries = await fs.readDir(root).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(root, entry.name);
    if (entry.isDirectory) {
      files.push(...(await collectJsonlFiles(child, fs)));
    } else if (entry.isFile && entry.name.endsWith(AGENT_SESSION_STORE.JSONL_EXTENSION)) {
      files.push(child);
    }
  }
  return files;
}

function isRecentAgentSessionMtime(modifiedAtMs: number, nowMs: number): boolean {
  return modifiedAtMs <= nowMs && nowMs - modifiedAtMs <= AGENT_RESUME_RECENT_WINDOW_MS;
}

function parseCodexCandidateFile(
  sourcePath: string,
  content: string,
  modifiedAtMs: number,
): CandidateDraft | null {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let updatedAt: string | null = null;

  for (const line of content.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    sessionId ??= firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.ID],
    ]);
    cwd ??= firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.CWD],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.CWD],
    ]);
    updatedAt = maxIsoTimestamp(updatedAt, firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]));
  }

  if (sessionId === null || cwd === null) {
    return null;
  }
  return {
    agent: AGENT_SESSION_KIND.CODEX,
    sessionId,
    cwd,
    sourcePath,
    modifiedAtMs,
    updatedAt,
    branch: null,
  };
}

function parseClaudeCodeCandidateFile(
  sourcePath: string,
  content: string,
  modifiedAtMs: number,
): CandidateDraft | null {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let updatedAt: string | null = null;
  let branch: string | null = null;

  for (const line of content.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    sessionId ??= firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL],
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID],
    ]);
    cwd ??= firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.CWD],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.CWD],
    ]);
    updatedAt = maxIsoTimestamp(updatedAt, firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]));
    branch ??= firstString(row, [[AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]]);
  }

  if (sessionId === null || cwd === null) {
    return null;
  }
  return {
    agent: AGENT_SESSION_KIND.CLAUDE_CODE,
    sessionId,
    cwd,
    sourcePath,
    modifiedAtMs,
    updatedAt,
    branch,
  };
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function firstString(row: Record<string, unknown>, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    const value = valueAtPath(row, path);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function valueAtPath(row: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = row;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maxIsoTimestamp(left: string | null, right: string | null): string | null {
  if (right === null) {
    return left;
  }
  if (left === null) {
    return right;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function compareCandidates(left: CandidateDraft, right: CandidateDraft): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) {
    return modifiedDiff;
  }
  return `${left.agent}:${left.sessionId}`.localeCompare(`${right.agent}:${right.sessionId}`);
}

function samePath(left: string, right: string): boolean {
  return resolve(left) === resolve(right);
}

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
