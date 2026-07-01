import { relative, resolve, sep } from "node:path";

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
  readHead(path: string, maxBytes: number): Promise<string>;
  stat(path: string): Promise<AgentSessionFileStat>;
}

export type AgentWorktreeRootResolver = (cwd: string) => Promise<string | null>;

export type AgentResumeScope =
  | { readonly kind: typeof AGENT_RESUME_SCOPE.WORKTREE }
  | { readonly kind: typeof AGENT_RESUME_SCOPE.BRANCH; readonly branch: string };

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
  readonly scope: AgentResumeScope;
  readonly fs: AgentSessionFileSystem;
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

export function codexSessionStoreDir(homeDir: string): string {
  return resolve(homeDir, AGENT_SESSION_STORE.CODEX_DIR, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR);
}

export function claudeCodeSessionStoreDir(homeDir: string): string {
  return resolve(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR);
}

const CLAUDE_PROJECT_PATH_SEPARATOR = "/";
const CLAUDE_PROJECT_ENCODED_SEPARATOR = "-";

// Claude Code names each project directory after the session's working
// directory with every path separator rewritten to `-`
// (`/Users/x/repo` -> `-Users-x-repo`), so the directory name resolves the
// working directory without opening a transcript.
export function claudeProjectDirName(cwd: string): string {
  return cwd.replaceAll(CLAUDE_PROJECT_PATH_SEPARATOR, CLAUDE_PROJECT_ENCODED_SEPARATOR);
}

export async function discoverAgentResumeCandidates(
  options: DiscoverAgentResumeCandidatesOptions,
): Promise<AgentResumeCandidate[]> {
  const scope = await resolveAgentResumeScopeContext(options);
  if (scope === null) {
    return [];
  }

  const cap = AGENT_RESUME_LIMITS.PER_AGENT_DISPLAYED_CANDIDATES;
  const [codex, claude] = await Promise.all([
    collectAgentCandidates(
      AGENT_SESSION_KIND.CODEX,
      await recentStoreFiles(
        await collectJsonlFiles(codexSessionStoreDir(options.homeDir), options.fs),
        options.fs,
        options.nowMs,
      ),
      options.fs,
      cap,
      scope.match,
      parseCodexHead,
    ),
    collectAgentCandidates(
      AGENT_SESSION_KIND.CLAUDE_CODE,
      await recentStoreFiles(
        await claudeTranscriptFiles(claudeCodeSessionStoreDir(options.homeDir), options.fs, scope.claudeDirAccepts),
        options.fs,
        options.nowMs,
      ),
      options.fs,
      cap,
      scope.match,
      parseClaudeHead,
    ),
  ]);

  return [...codex, ...claude].sort(compareCandidates);
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
  if (invocationRoot === null) {
    return null;
  }
  const projectPrefix = claudeProjectDirName(invocationRoot);
  return {
    match: (core) => isPathInsideOrEqual(invocationRoot, core.cwd),
    claudeDirAccepts: (dirName) => dirName.startsWith(projectPrefix),
  };
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

interface AgentSessionHead {
  readonly sessionId: string;
  readonly cwd: string;
  readonly branch: string | null;
  readonly updatedAt: string | null;
  readonly interactive: boolean;
}

interface AgentStoreFile {
  readonly path: string;
  readonly modifiedAtMs: number;
}

async function recentStoreFiles(
  paths: readonly string[],
  fs: AgentSessionFileSystem,
  nowMs: number,
): Promise<AgentStoreFile[]> {
  const stats = await mapWithConcurrency(paths, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (path) => {
    const stat = await fs.stat(path).catch(() => null);
    if (stat === null || !isRecentAgentSessionMtime(stat.mtimeMs, nowMs)) {
      return null;
    }
    return { path, modifiedAtMs: stat.mtimeMs };
  });
  return stats
    .filter((file): file is AgentStoreFile => file !== null)
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
}

// Claude Code stores each session's transcript directly under its
// working-directory-named project directory. Only the immediate `.jsonl`
// children of a project directory are collected, so every nested transcript is
// excluded — including the `subagents/` transcripts, which are not resumable
// top-level conversations.
async function claudeTranscriptFiles(
  root: string,
  fs: AgentSessionFileSystem,
  dirAccepts: (dirName: string) => boolean,
): Promise<string[]> {
  const projectDirs = (await fs.readDir(root).catch(() => []))
    .filter((entry) => entry.isDirectory && dirAccepts(entry.name))
    .map((entry) => resolve(root, entry.name));
  const files: string[] = [];
  for (const dir of projectDirs) {
    const entries = await fs.readDir(dir).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile && entry.name.endsWith(AGENT_SESSION_STORE.JSONL_EXTENSION)) {
        files.push(resolve(dir, entry.name));
      }
    }
  }
  return files;
}

// Scans candidate files newest first, reading only each transcript's metadata
// head, and collects the newest scope-matching sessions per agent up to the cap.
// Sessions sharing one session id collapse to their newest source because the
// first (newest) occurrence claims the id and later ones are skipped.
async function collectAgentCandidates(
  agent: AgentSessionKind,
  files: readonly AgentStoreFile[],
  fs: AgentSessionFileSystem,
  cap: number,
  match: (core: AgentSessionHead) => boolean,
  parseHead: (head: string) => AgentSessionHead | null,
): Promise<AgentResumeCandidate[]> {
  const seen = new Set<string>();
  const candidates: AgentResumeCandidate[] = [];
  for (const file of files) {
    if (candidates.length >= cap) {
      break;
    }
    const head = await fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) {
      continue;
    }
    const core = parseHead(head);
    if (core === null || !core.interactive || seen.has(core.sessionId)) {
      continue;
    }
    seen.add(core.sessionId);
    if (!match(core)) {
      continue;
    }
    candidates.push({
      agent,
      sessionId: core.sessionId,
      cwd: core.cwd,
      sourcePath: file.path,
      modifiedAtMs: file.modifiedAtMs,
      updatedAt: core.updatedAt,
      branch: core.branch,
    });
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

function parseCodexHead(head: string): AgentSessionHead | null {
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
    return {
      sessionId,
      cwd,
      branch: firstString(row, [
        [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.GIT, AGENT_SESSION_JSON_FIELDS.BRANCH],
        [AGENT_SESSION_JSON_FIELDS.GIT, AGENT_SESSION_JSON_FIELDS.BRANCH],
      ]),
      updatedAt: firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]),
      interactive: isCodexInteractive(originator, threadSource),
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

function parseClaudeHead(head: string): AgentSessionHead | null {
  for (const line of head.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    const sessionId = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL],
      [AGENT_SESSION_JSON_FIELDS.SESSION_ID],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID_CAMEL],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.SESSION_ID],
    ]);
    const cwd = firstString(row, [
      [AGENT_SESSION_JSON_FIELDS.CWD],
      [AGENT_SESSION_JSON_FIELDS.PAYLOAD, AGENT_SESSION_JSON_FIELDS.CWD],
    ]);
    if (sessionId === null || cwd === null) {
      continue;
    }
    return {
      sessionId,
      cwd,
      branch: firstString(row, [[AGENT_SESSION_JSON_FIELDS.GIT_BRANCH]]),
      updatedAt: firstString(row, [[AGENT_SESSION_JSON_FIELDS.TIMESTAMP]]),
      interactive: true,
    };
  }
  return null;
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

function compareCandidates(left: AgentResumeCandidate, right: AgentResumeCandidate): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) {
    return modifiedDiff;
  }
  return `${left.agent}:${left.sessionId}`.localeCompare(`${right.agent}:${right.sessionId}`);
}

// Whether `child` is `parent` itself or nested beneath it, by normalized path.
export function isPathInsideOrEqual(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel.length === 0 || (rel !== ".." && !rel.startsWith(`..${sep}`));
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
