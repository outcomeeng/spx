import { resolve } from "node:path";

import { isPathContained } from "@/lib/file-system/pathContainment";

import { type AgentHomeDirs, piSessionStoreDir } from "./home";

export { piSessionStoreDir } from "./home";
import {
  AGENT_RESUME_COMMAND,
  AGENT_RESUME_LIMITS,
  AGENT_RESUME_MODE,
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_RESUME_SCOPE,
  AGENT_RESUME_TEXT,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_LABEL,
  AGENT_SESSION_ROW_TYPE,
  AGENT_SESSION_STORE,
  type AgentResumeMode,
  type AgentSessionKind,
  CODEX_SESSION_ORIGINATOR,
  CODEX_SESSION_THREAD_SOURCE,
  compareAgentSessionText,
} from "./protocol";
import { firstString, parseJsonObject, valueAtPath } from "./transcript-json";

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
  readHead(path: string, maxBytes: number): Promise<string>;
  stat(path: string): Promise<AgentSessionFileStat>;
}

export interface AgentResumeSessionFileSystem extends AgentSessionFileSystem {
  readTail(path: string, maxBytes: number): Promise<string>;
}

export type AgentWorktreeRootResolver = (cwd: string) => Promise<string>;

export type AgentResumeScope =
  | { readonly kind: typeof AGENT_RESUME_SCOPE.WORKTREE }
  | { readonly kind: typeof AGENT_RESUME_SCOPE.BRANCH; readonly branch: string };

type AgentResumeScopeKind = AgentResumeScope["kind"];

export function worktreeResumeScope(): AgentResumeScope {
  return { kind: AGENT_RESUME_SCOPE.WORKTREE };
}

export function branchResumeScope(branch: string): AgentResumeScope {
  return { kind: AGENT_RESUME_SCOPE.BRANCH, branch };
}

export interface AgentResumeCandidate {
  readonly agent: AgentSessionKind;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly modifiedAtMs: number;
  readonly lastActivityAtMs: number | null;
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
  readonly agentHomeDirs: AgentHomeDirs;
  readonly nowMs: number;
  readonly scope: AgentResumeScope;
  readonly sinceMs?: number;
  readonly fs: AgentResumeSessionFileSystem;
  readonly resolveWorktreeRoot: AgentWorktreeRootResolver;
}

export interface AgentResumeModeFlags {
  readonly latest?: boolean;
  readonly list?: boolean;
  readonly json?: boolean;
}

export const AGENT_RESUME_PICKER_ACTION = {
  MOVE_UP: "move-up",
  MOVE_DOWN: "move-down",
  CHOOSE: "choose",
  QUIT: "quit",
  IGNORE: "ignore",
} as const;

export type AgentResumePickerAction = (typeof AGENT_RESUME_PICKER_ACTION)[keyof typeof AGENT_RESUME_PICKER_ACTION];

export interface AgentResumePickerInput {
  readonly input: string;
  readonly upArrow: boolean;
  readonly downArrow: boolean;
  readonly return: boolean;
  readonly escape: boolean;
}

export interface AgentResumePickerState {
  readonly selectedIndex: number;
}

const FIRST_PICKER_INDEX = 0;
const PICKER_MOVE_UP_DELTA = -1;
const PICKER_MOVE_DOWN_DELTA = 1;
const PICKER_QUIT_INPUT = "q";
export class AgentResumeModeError extends Error {
  constructor(readonly selectedModes: readonly AgentResumeMode[]) {
    super(`${AGENT_RESUME_TEXT.MODE_CONFLICT}: ${selectedModes.join(", ")}`);
    this.name = "AgentResumeModeError";
  }
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

export function initialAgentResumePickerState(): AgentResumePickerState {
  return { selectedIndex: FIRST_PICKER_INDEX };
}

export function resolveAgentResumePickerAction(input: AgentResumePickerInput): AgentResumePickerAction {
  if (input.upArrow) return AGENT_RESUME_PICKER_ACTION.MOVE_UP;
  if (input.downArrow) return AGENT_RESUME_PICKER_ACTION.MOVE_DOWN;
  if (input.return) return AGENT_RESUME_PICKER_ACTION.CHOOSE;
  if (input.escape || input.input === PICKER_QUIT_INPUT) return AGENT_RESUME_PICKER_ACTION.QUIT;
  return AGENT_RESUME_PICKER_ACTION.IGNORE;
}

export function reduceAgentResumePickerState(
  state: AgentResumePickerState,
  action: AgentResumePickerAction,
  candidateCount: number,
): AgentResumePickerState {
  if (action === AGENT_RESUME_PICKER_ACTION.MOVE_UP) {
    return moveAgentResumePickerSelection(state, PICKER_MOVE_UP_DELTA, candidateCount);
  }
  if (action === AGENT_RESUME_PICKER_ACTION.MOVE_DOWN) {
    return moveAgentResumePickerSelection(state, PICKER_MOVE_DOWN_DELTA, candidateCount);
  }
  return state;
}

function moveAgentResumePickerSelection(
  state: AgentResumePickerState,
  delta: number,
  candidateCount: number,
): AgentResumePickerState {
  const lastIndex = Math.max(candidateCount - 1, FIRST_PICKER_INDEX);
  const nextIndex = Math.min(Math.max(state.selectedIndex + delta, FIRST_PICKER_INDEX), lastIndex);
  return { selectedIndex: nextIndex };
}

export function codexSessionStoreDir(codexHomeDir: string): string {
  return resolve(codexHomeDir, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR);
}

export function claudeCodeSessionStoreDir(claudeCodeHomeDir: string): string {
  return resolve(claudeCodeHomeDir, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR);
}

const CLAUDE_PROJECT_PATH_SEPARATORS = /[/\\]/g;
export const CLAUDE_PROJECT_ENCODED_SEPARATOR = "-";

// Claude Code names each project directory after the session's working
// directory with every path separator — POSIX `/` or Windows `\` — rewritten
// to `-` (`/Users/x/repo` -> `-Users-x-repo`), so the directory name resolves
// the working directory without opening a transcript.
export function claudeProjectDirName(cwd: string): string {
  return cwd.replace(CLAUDE_PROJECT_PATH_SEPARATORS, CLAUDE_PROJECT_ENCODED_SEPARATOR);
}

interface AgentResumeAdapter {
  readonly agent: AgentSessionKind;
  readonly scopes: readonly AgentResumeScopeKind[];
  readonly collectFiles: (
    options: DiscoverAgentResumeCandidatesOptions,
    scope: AgentResumeScopeContext,
  ) => Promise<readonly string[]>;
  readonly parseHead: (head: string) => AgentSessionHead | null;
  readonly launch: (candidate: AgentResumeCandidate) => AgentResumeLaunchCommand;
}

export const AGENT_RESUME_ADAPTER_REGISTRY: Readonly<Record<AgentSessionKind, AgentResumeAdapter>> = {
  [AGENT_SESSION_KIND.CODEX]: {
    agent: AGENT_SESSION_KIND.CODEX,
    scopes: [AGENT_RESUME_SCOPE.WORKTREE, AGENT_RESUME_SCOPE.BRANCH],
    collectFiles: (options) => collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs),
    parseHead: parseCodexHead,
    launch: (candidate) => ({
      command: AGENT_RESUME_COMMAND.CODEX_BINARY,
      args: [AGENT_RESUME_COMMAND.CODEX_RESUME, candidate.sessionId],
      cwd: candidate.cwd,
    }),
  },
  [AGENT_SESSION_KIND.CLAUDE_CODE]: {
    agent: AGENT_SESSION_KIND.CLAUDE_CODE,
    scopes: [AGENT_RESUME_SCOPE.WORKTREE, AGENT_RESUME_SCOPE.BRANCH],
    collectFiles: (options, scope) =>
      claudeTranscriptFiles(
        claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
        options.fs,
        scope.claudeDirAccepts,
      ),
    parseHead: parseClaudeHead,
    launch: (candidate) => ({
      command: AGENT_RESUME_COMMAND.CLAUDE_BINARY,
      args: [AGENT_RESUME_COMMAND.CLAUDE_RESUME, candidate.sessionId],
      cwd: candidate.cwd,
    }),
  },
  [AGENT_SESSION_KIND.PI]: {
    agent: AGENT_SESSION_KIND.PI,
    scopes: [AGENT_RESUME_SCOPE.WORKTREE],
    collectFiles: (options) =>
      collectJsonlFiles(
        piSessionStoreDir(options.agentHomeDirs.piAgent, options.agentHomeDirs.piSessions),
        options.fs,
      ),
    parseHead: parsePiHead,
    launch: (candidate) => ({
      command: AGENT_RESUME_COMMAND.PI_BINARY,
      args: [AGENT_RESUME_COMMAND.PI_SESSION, candidate.sourcePath],
      cwd: candidate.cwd,
    }),
  },
};

const AGENT_RESUME_ADAPTERS: readonly AgentResumeAdapter[] = Object.values(AGENT_RESUME_ADAPTER_REGISTRY);

export async function discoverAgentResumeCandidates(
  options: DiscoverAgentResumeCandidatesOptions,
): Promise<AgentResumeCandidate[]> {
  const scope = await resolveAgentResumeScopeContext(options);
  if (scope === null) {
    return [];
  }

  const cap = AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES;
  const recentWindowMs = options.sinceMs ?? AGENT_RESUME_RECENT_WINDOW_MS;
  const perAgent = await Promise.all(
    AGENT_RESUME_ADAPTERS.filter((adapter) => adapter.scopes.includes(options.scope.kind)).map(async (adapter) =>
      collectAgentCandidates(
        adapter.agent,
        await recentStoreFiles(
          await adapter.collectFiles(options, scope),
          options.fs,
          options.nowMs,
          recentWindowMs,
        ),
        options.fs,
        cap,
        scope.match,
        adapter.parseHead,
        options.nowMs,
        options.sinceMs,
      )
    ),
  );

  return limitAgentResumeCandidates(perAgent.flat());
}

export function limitAgentResumeCandidates(
  candidates: readonly AgentResumeCandidate[],
): AgentResumeCandidate[] {
  return [...candidates].sort(compareCandidates).slice(0, AGENT_RESUME_LIMITS.TOTAL_DISPLAYED_CANDIDATES);
}

interface AgentResumeScopeContext {
  readonly match: (core: AgentSessionHead) => boolean;
  readonly claudeDirAccepts: (dirName: string) => boolean;
}

async function resolveAgentResumeScopeContext(
  options: DiscoverAgentResumeCandidatesOptions,
): Promise<AgentResumeScopeContext | null> {
  if (options.scope.kind === AGENT_RESUME_SCOPE.BRANCH) {
    const target = options.scope.branch;
    return { match: (core) => core.branch === target, claudeDirAccepts: () => true };
  }
  const invocationRoot = await options.resolveWorktreeRoot(options.invocationDir);
  const projectPrefix = claudeProjectDirName(invocationRoot);
  return {
    match: (core) => isPathInsideOrEqual(invocationRoot, core.cwd),
    claudeDirAccepts: (dirName) =>
      dirName === projectPrefix || dirName.startsWith(`${projectPrefix}${CLAUDE_PROJECT_ENCODED_SEPARATOR}`),
  };
}

export function buildAgentResumeLaunchCommand(candidate: AgentResumeCandidate): AgentResumeLaunchCommand {
  return AGENT_RESUME_ADAPTER_REGISTRY[candidate.agent].launch(candidate);
}

export function renderAgentResumeList(candidates: readonly AgentResumeCandidate[]): string {
  if (candidates.length === 0) {
    return AGENT_RESUME_TEXT.NO_MATCHES;
  }
  return candidates.map((candidate) => {
    const updatedAt = candidate.lastActivityAtMs === null
      ? "unknown"
      : new Date(candidate.lastActivityAtMs).toISOString();
    return `${updatedAt} ${AGENT_SESSION_LABEL[candidate.agent]} ${candidate.sessionId} ${candidate.cwd}`;
  }).join("\n");
}

export function renderAgentResumeJson(candidates: readonly AgentResumeCandidate[]): string {
  return JSON.stringify(candidates, null, 2);
}

export interface AgentSessionHead {
  readonly sessionId: string;
  readonly cwd: string;
  readonly branch: string | null;
  readonly updatedAt: string | null;
  readonly interactive: boolean;
  readonly subagent: boolean;
}

export interface AgentStoreFile {
  readonly path: string;
  readonly modifiedAtMs: number;
}

async function recentStoreFiles(
  paths: readonly string[],
  fs: AgentSessionFileSystem,
  nowMs: number,
  recentWindowMs: number,
): Promise<AgentStoreFile[]> {
  const stats = await mapWithConcurrency(paths, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (path) => {
    const stat = await fs.stat(path).catch(() => null);
    if (stat === null || !isRecentAgentSessionMtime(stat.mtimeMs, nowMs, recentWindowMs)) {
      return null;
    }
    return { path, modifiedAtMs: stat.mtimeMs };
  });
  return stats
    .filter((file): file is AgentStoreFile => file !== null)
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || compareAgentSessionText(left.path, right.path));
}

// Claude Code stores each session's transcript directly under its
// working-directory-named project directory. Only the immediate `.jsonl`
// children of a project directory are collected, so every nested transcript is
// excluded — including the `subagents/` transcripts, which are not resumable
// top-level conversations.
export async function claudeTranscriptFiles(
  root: string,
  fs: AgentSessionFileSystem,
  dirAccepts: (dirName: string) => boolean,
): Promise<string[]> {
  const projectDirs = (await fs.readDir(root).catch(() => []))
    .filter((entry) => entry.isDirectory && dirAccepts(entry.name))
    .map((entry) => resolve(root, entry.name));
  const perDir = await mapWithConcurrency(projectDirs, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (dir) => {
    const entries = await fs.readDir(dir).catch(() => []);
    return entries
      .filter((entry) => entry.isFile && entry.name.endsWith(AGENT_SESSION_STORE.JSONL_EXTENSION))
      .map((entry) => resolve(dir, entry.name));
  });
  return perDir.flat();
}

// Scans recent candidate files, reading each transcript's metadata head and
// bounded activity tail, then collects the newest scope-matching sessions per
// agent up to the cap.
// A session id is claimed only by a scope-matching source, so an out-of-scope
// newer transcript never suppresses an in-scope older one; among matching
// sources the newest transcript activity wins and later duplicates are skipped.
async function collectAgentCandidates(
  agent: AgentSessionKind,
  files: readonly AgentStoreFile[],
  fs: AgentResumeSessionFileSystem,
  cap: number,
  match: (core: AgentSessionHead) => boolean,
  parseHead: (head: string) => AgentSessionHead | null,
  nowMs: number,
  sinceMs: number | undefined,
): Promise<AgentResumeCandidate[]> {
  const candidates = await mapWithConcurrency(files, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (file) => {
    const head = await fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) {
      return null;
    }
    const core = parseHead(head);
    if (core === null || !core.interactive || !match(core)) {
      return null;
    }
    const tail = await fs.readTail(file.path, AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES).catch(() => null);
    if (tail === null) {
      return null;
    }
    const lastActivityAtMs = latestTranscriptTimestampMs(tail);
    if (sinceMs !== undefined && !isAgentSessionActivityWithinWindow(lastActivityAtMs, nowMs, sinceMs)) {
      return null;
    }
    return {
      agent,
      sessionId: core.sessionId,
      cwd: core.cwd,
      sourcePath: file.path,
      modifiedAtMs: file.modifiedAtMs,
      lastActivityAtMs,
      updatedAt: core.updatedAt,
      branch: core.branch,
    };
  });
  const bySessionId = new Map<string, AgentResumeCandidate>();
  for (const candidate of candidates) {
    if (candidate === null) {
      continue;
    }
    const existing = bySessionId.get(candidate.sessionId);
    if (existing === undefined || compareCandidates(candidate, existing) < 0) {
      bySessionId.set(candidate.sessionId, candidate);
    }
  }
  return [...bySessionId.values()].sort(compareCandidates).slice(0, cap);
}

export async function collectJsonlFiles(root: string, fs: AgentSessionFileSystem): Promise<string[]> {
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

export function isRecentAgentSessionMtime(
  modifiedAtMs: number,
  nowMs: number,
  recentWindowMs = AGENT_RESUME_RECENT_WINDOW_MS,
): boolean {
  return modifiedAtMs <= nowMs && nowMs - modifiedAtMs <= recentWindowMs;
}

export function isAgentSessionActivityWithinWindow(
  lastActivityAtMs: number | null,
  nowMs: number,
  sinceMs: number,
): boolean {
  return lastActivityAtMs !== null && lastActivityAtMs <= nowMs && nowMs - lastActivityAtMs <= sinceMs;
}

export function parseCodexHead(head: string): AgentSessionHead | null {
  for (const line of head.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    if (firstString(row, [[AGENT_SESSION_JSON_FIELDS.TYPE]]) !== AGENT_SESSION_ROW_TYPE.CODEX_SESSION_META) {
      continue;
    }
    const sessionId = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.ID],
    ]);
    const cwd = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.CWD],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.CWD],
    ]);
    if (sessionId === null || cwd === null) {
      return null;
    }
    const originator = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.ORIGINATOR],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.ORIGINATOR],
    ]);
    const threadSource = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.THREAD_SOURCE],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.THREAD_SOURCE],
    ]);
    const subagent = threadSource === CODEX_SESSION_THREAD_SOURCE.SUBAGENT;
    return {
      sessionId,
      cwd,
      branch: firstString(row, [
        [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.GIT, AGENT_SESSION_JSON_FIELDS.BRANCH],
        [AGENT_SESSION_JSON_FIELDS.GIT, AGENT_SESSION_JSON_FIELDS.BRANCH],
      ]),
      updatedAt: firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]),
      interactive: isCodexInteractive(originator, threadSource),
      subagent,
    };
  }
  return null;
}

function isCodexInteractive(originator: string | null, threadSource: string | null): boolean {
  if (threadSource === CODEX_SESSION_THREAD_SOURCE.SUBAGENT) {
    return false;
  }
  return originator === CODEX_SESSION_ORIGINATOR.TUI
    || originator === CODEX_SESSION_ORIGINATOR.CLI
    || originator === CODEX_SESSION_ORIGINATOR.VSCODE
    || originator === CODEX_SESSION_ORIGINATOR.VSCODE_HYPHEN;
}

// Claude Code records the working directory and session id on the opening rows
// but the branch on a later row, so the metadata head is scanned for the first
// non-null value of each field rather than read from a single row.
export function parseClaudeHead(head: string): AgentSessionHead | null {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let branch: string | null = null;
  let updatedAt: string | null = null;
  for (const line of head.split("\n")) {
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
    updatedAt ??= firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]);
    branch ??= firstString(row, [[AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]]);
    if (sessionId !== null && cwd !== null && branch !== null) {
      break;
    }
  }
  if (sessionId === null || cwd === null) {
    return null;
  }
  return { sessionId, cwd, branch, updatedAt, interactive: true, subagent: false };
}

export function parsePiHead(head: string): AgentSessionHead | null {
  const row = parseJsonObject(head.split("\n", 1)[0] ?? "");
  if (row === null || firstString(row, [[AGENT_SESSION_JSON_FIELDS.TYPE]]) !== AGENT_SESSION_ROW_TYPE.PI_SESSION) {
    return null;
  }
  const version = valueAtPath(row, [AGENT_SESSION_JSON_FIELDS.VERSION]);
  const sessionId = firstString(row, [[AGENT_SESSION_JSON_FIELDS.ID]]);
  const cwd = firstString(row, [[AGENT_SESSION_JSON_FIELDS.CWD]]);
  if (!Number.isSafeInteger(version) || Number(version) <= 0 || sessionId === null || cwd === null) {
    return null;
  }
  return {
    sessionId,
    cwd,
    branch: null,
    updatedAt: firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]),
    interactive: true,
    subagent: false,
  };
}

function latestTranscriptTimestampMs(transcriptSlice: string): number | null {
  let latest: number | null = null;
  for (const line of transcriptSlice.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    const timestampMs = parseTimestampMs(firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]));
    if (timestampMs !== null && (latest === null || timestampMs > latest)) {
      latest = timestampMs;
    }
  }
  return latest;
}

function parseTimestampMs(timestamp: string | null): number | null {
  if (timestamp === null) {
    return null;
  }
  const timestampMs = Date.parse(timestamp);
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

function compareCandidates(left: AgentResumeCandidate, right: AgentResumeCandidate): number {
  if (left.lastActivityAtMs !== null && right.lastActivityAtMs !== null) {
    const activityDiff = right.lastActivityAtMs - left.lastActivityAtMs;
    if (activityDiff !== 0) {
      return activityDiff;
    }
  } else if (left.lastActivityAtMs !== null) {
    return -1;
  } else if (right.lastActivityAtMs !== null) {
    return 1;
  }
  const agentDiff = agentResumeAdapterOrder(left.agent) - agentResumeAdapterOrder(right.agent);
  if (agentDiff !== 0) {
    return agentDiff;
  }
  return compareCodeUnits(`${left.sessionId}:${left.sourcePath}`, `${right.sessionId}:${right.sourcePath}`);
}

function agentResumeAdapterOrder(agent: AgentSessionKind): number {
  return AGENT_RESUME_ADAPTERS.findIndex((adapter) => adapter.agent === agent);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function isPathInsideOrEqual(parent: string, child: string): boolean {
  return isPathContained(resolve(parent), resolve(child));
}

export async function mapWithConcurrency<T, U>(
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
