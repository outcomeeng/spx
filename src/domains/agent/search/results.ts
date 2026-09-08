import { dirname, resolve } from "node:path";

import { piSessionStoreDir } from "../home";
import type { AgentHomeDirs } from "../home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_SEARCH_MATCH_REASON,
  AGENT_SEARCH_RECENT_WINDOW_MS,
  AGENT_SEARCH_SESSION_KINDS,
  AGENT_SESSION_KIND,
  type AgentSearchMatchReason,
  type AgentSearchSessionKind,
  compareAgentSessionText,
} from "../protocol";
import {
  type AgentSessionFileStat,
  type AgentSessionFileSystem,
  type AgentSessionHead,
  type AgentStoreFile,
  CLAUDE_PROJECT_ENCODED_SEPARATOR,
  claudeCodeSessionStoreDir,
  claudeProjectDirName,
  claudeTranscriptFiles,
  codexSessionStoreDir,
  collectJsonlFiles,
  isRecentAgentSessionMtime,
  mapWithConcurrency,
  parseClaudeHead,
  parseCodexHead,
  parsePiHead,
} from "../resume";
import {
  type AgentHeadParser,
  branchMetadataOrWorktreeMatchReasons,
  type BranchSearchMatch,
  branchTranscriptCommandMatchReasons,
  type CodexSubagentBranchAssociation,
  collectCodexSubagentBranchAssociations,
  collectTopLevelBranchAssociations,
  coreMatchesSearchScope,
  currentMetadataBranchAssociationCwd,
  cwdMatchesSearchScope,
  type TopLevelBranchAssociations,
} from "./branch-association";
import type { TranscriptLocator } from "./locator";
import { type AgentSearchContentNeedle, type AgentSearchQuery, hasSearchSelector } from "./query";
import {
  type AgentTranscriptRecord,
  parseClaudeTranscriptRecords,
  recordedBranchCwd,
  recordedCwdMatching,
  type TranscriptRecordReader,
} from "./transcript-records";

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  /** The transcript's whole text; read only for a transcript the locator named. */
  readText(path: string): Promise<string>;
}

interface AgentSearchAdapter {
  readonly storeRoot: (agentHomeDirs: AgentHomeDirs) => string;
  readonly collectPaths: (
    options: AgentSearchOptions,
    acceptsClaudeDir: (dirName: string) => boolean,
  ) => Promise<readonly string[]>;
  /** Whether a located transcript sits where this store files a top-level session's transcript. */
  readonly isTopLevelTranscriptPath: (path: string, storeRoot: string) => boolean;
  readonly parseHead: AgentHeadParser;
  readonly readRecords: TranscriptRecordReader | null;
  readonly acceptsTranscriptCommandEvidence: boolean;
  readonly acceptsCodexSubagentEvidence: boolean;
}

const AGENT_SEARCH_ADAPTER_REGISTRY: Readonly<Record<AgentSearchSessionKind, AgentSearchAdapter>> = {
  [AGENT_SESSION_KIND.CODEX]: {
    storeRoot: (agentHomeDirs) => codexSessionStoreDir(agentHomeDirs.codex),
    collectPaths: (options) => collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs),
    isTopLevelTranscriptPath: acceptsEveryStorePath,
    parseHead: parseCodexHead,
    readRecords: null,
    acceptsTranscriptCommandEvidence: true,
    acceptsCodexSubagentEvidence: true,
  },
  [AGENT_SESSION_KIND.CLAUDE_CODE]: {
    storeRoot: (agentHomeDirs) => claudeCodeSessionStoreDir(agentHomeDirs.claudeCode),
    collectPaths: (options, acceptsClaudeDir) =>
      claudeTranscriptFiles(
        claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
        options.fs,
        acceptsClaudeDir,
      ),
    isTopLevelTranscriptPath: isClaudeProjectTranscriptPath,
    parseHead: parseClaudeHead,
    readRecords: parseClaudeTranscriptRecords,
    acceptsTranscriptCommandEvidence: true,
    acceptsCodexSubagentEvidence: false,
  },
  [AGENT_SESSION_KIND.PI]: {
    storeRoot: (agentHomeDirs) => piSessionStoreDir(agentHomeDirs.piAgent, agentHomeDirs.piSessions),
    collectPaths: (options) =>
      collectJsonlFiles(piSessionStoreDir(options.agentHomeDirs.piAgent, options.agentHomeDirs.piSessions), options.fs),
    isTopLevelTranscriptPath: acceptsEveryStorePath,
    parseHead: parsePiHead,
    readRecords: null,
    acceptsTranscriptCommandEvidence: false,
    acceptsCodexSubagentEvidence: false,
  },
};

export interface AgentSearchOptions {
  readonly agentHomeDirs: AgentHomeDirs;
  readonly nowMs: number;
  readonly productScopeRoot: string;
  readonly branchAssociatedWorktreeRoots?: readonly string[];
  readonly fs: AgentSearchFileSystem;
  readonly locator: TranscriptLocator;
  readonly query: AgentSearchQuery;
}

export interface AgentSearchResult {
  readonly agent: AgentSearchSessionKind;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly modifiedAtMs: number;
  readonly updatedAt: string | null;
  readonly branch: string | null;
  readonly matches: readonly AgentSearchMatchReason[];
}

/**
 * The transcripts the locator named for one store, per needle. A row lies in every content
 * needle's set and, under a session-id selector, in the id's set; a branch needle's set bounds
 * transcript-borne branch evidence. A transcript outside every set is never read past its head.
 */
interface LocatedTranscripts {
  readonly content: readonly ReadonlySet<string>[];
  readonly sessionId: ReadonlySet<string> | null;
  readonly branch: ReadonlySet<string> | null;
}

export async function searchAgentSessions(options: AgentSearchOptions): Promise<AgentSearchResult[]> {
  const selectedAgents = options.query.agent === null ? AGENT_SEARCH_SESSION_KINDS : [options.query.agent];
  const perAgent = await Promise.all(
    selectedAgents.map((agent) => searchAgentStore(agent, options)),
  );
  return perAgent
    .flat()
    .sort(compareSearchResults)
    .slice(0, Math.max(0, options.query.limit));
}

async function searchAgentStore(
  agent: AgentSearchSessionKind,
  options: AgentSearchOptions,
): Promise<AgentSearchResult[]> {
  const adapter = AGENT_SEARCH_ADAPTER_REGISTRY[agent];
  const located = await locateTranscripts(options, adapter);
  const paths = await candidatePaths(options, adapter, located);
  const parser = adapter.parseHead;
  const needsBranchEvidence = options.query.branch !== null;
  const recentWindowMs = searchRecentWindowMs(options.query);
  const allFiles = needsBranchEvidence ? await storeFiles(paths, options.fs, options.nowMs, true, recentWindowMs) : [];
  const files = needsBranchEvidence
    ? options.query.includeAll ? allFiles : recentStoreFiles(allFiles, options.nowMs, recentWindowMs)
    : await storeFiles(paths, options.fs, options.nowMs, options.query.includeAll, recentWindowMs);
  const candidates = candidateFiles(files, located, options.query);
  const branchEvidenceFiles = needsBranchEvidence
    ? nonFutureStoreFiles(allFiles, options.nowMs).filter((file) => located.branch?.has(file.path) === true)
    : [];
  const topLevelBranchAssociations = needsBranchEvidence && adapter.acceptsTranscriptCommandEvidence
    ? await collectTopLevelBranchAssociations(branchEvidenceFiles, options, parser)
    : emptyTopLevelBranchAssociations();
  const subagentBranchAssociations = needsBranchEvidence && adapter.acceptsCodexSubagentEvidence
    ? await collectCodexSubagentBranchAssociations(branchEvidenceFiles, options)
    : new Map<string, CodexSubagentBranchAssociation>();
  return collectMatchingSessions(
    agent,
    candidates,
    options,
    adapter,
    located,
    topLevelBranchAssociations,
    subagentBranchAssociations,
  );
}

/**
 * Runs the locator once per needle over the store root. A selector-free listing calls no
 * locator, and a store root the filesystem cannot list yields empty sets without a run.
 */
async function locateTranscripts(
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
): Promise<LocatedTranscripts> {
  const { query } = options;
  const root = adapter.storeRoot(options.agentHomeDirs);
  const rootListable = await options.fs.readDir(root).then(() => true, () => false);
  const locate = async (needle: string): Promise<ReadonlySet<string>> =>
    new Set(rootListable ? await options.locator.locate([root], needle) : []);
  const [content, sessionId, branch] = await Promise.all([
    Promise.all(query.contentNeedles.map((needle) => locate(needle.value))),
    query.sessionId === null ? Promise.resolve(null) : locate(query.sessionId),
    query.branch === null || !consumesTranscriptBranchEvidence(adapter) ? Promise.resolve(null) : locate(query.branch),
  ]);
  return { content, sessionId, branch };
}

/**
 * Whether a store's transcripts carry branch evidence the search reads — recorded branch values
 * or accepted commands. A store carrying neither associates a branch through worktree roots and
 * opening metadata alone, so locating the branch name in it names transcripts nothing reads.
 */
function consumesTranscriptBranchEvidence(adapter: AgentSearchAdapter): boolean {
  return adapter.readRecords !== null || adapter.acceptsTranscriptCommandEvidence;
}

/**
 * The paths a store contributes as candidates. A branch selector and a selector-free or
 * agent-only listing walk the store, because worktree-root association and the opening-directory
 * scope read opening metadata the locator cannot see. A content or session-id selector without a
 * branch draws its candidates from the locator's result sets alone, keeping only paths filed
 * where the store keeps a top-level session's transcript, so no project directory is listed.
 */
async function candidatePaths(
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  located: LocatedTranscripts,
): Promise<readonly string[]> {
  if (options.query.branch !== null || !hasLocatorNeedle(options.query)) {
    return adapter.collectPaths(options, claudeDirAdmission(options));
  }
  const storeRoot = adapter.storeRoot(options.agentHomeDirs);
  const sets = [...located.content, ...(located.sessionId === null ? [] : [located.sessionId])];
  const [first = new Set<string>(), ...rest] = sets;
  return [...first]
    .filter((path) => rest.every((set) => set.has(path)))
    .filter((path) => adapter.isTopLevelTranscriptPath(path, storeRoot))
    .sort(compareAgentSessionText);
}

function acceptsEveryStorePath(): boolean {
  return true;
}

/** Claude Code files a top-level session's transcript directly under its project directory. */
function isClaudeProjectTranscriptPath(path: string, storeRoot: string): boolean {
  return resolve(dirname(dirname(path))) === resolve(storeRoot);
}

/**
 * A row lies in every content set and in the session-id set. A branch selector admits every
 * listed file: worktree-root association reads opening metadata the locator cannot see, and a
 * transcript in the branch set but outside the content set is never a row, yet its recorded
 * branch associates a sibling transcript of the same session that is one.
 */
function candidateFiles(
  files: readonly AgentStoreFile[],
  located: LocatedTranscripts,
  query: AgentSearchQuery,
): readonly AgentStoreFile[] {
  if (query.branch !== null) {
    return files;
  }
  return files.filter((file) =>
    located.content.every((set) => set.has(file.path))
    && (located.sessionId === null || located.sessionId.has(file.path))
  );
}

/** Whether the locator named this transcript for any needle of the invocation. */
function locatorNamed(located: LocatedTranscripts, path: string): boolean {
  return located.content.some((set) => set.has(path))
    || located.sessionId?.has(path) === true
    || located.branch?.has(path) === true;
}

/** A session id names one session, so product scope selects the reported directory, not the result set. */
function scopeDecidesInclusion(query: AgentSearchQuery): boolean {
  return query.sessionId === null;
}

/**
 * Only a selector read from recorded content can match a session the store filed elsewhere,
 * so only that selector needs every directory admitted. Every other query resolves scope from
 * the opening working directory alone — the same value the directory name encodes — so there
 * the name excludes nothing the scope check would keep.
 */
function claudeDirAdmission(options: AgentSearchOptions): (dirName: string) => boolean {
  if (hasLocatorNeedle(options.query)) {
    return acceptsEveryClaudeProjectDir;
  }
  const projectPrefixes = [options.productScopeRoot, ...(options.branchAssociatedWorktreeRoots ?? [])]
    .map(claudeProjectDirName);
  return (dirName) =>
    projectPrefixes.some((projectPrefix) =>
      dirName === projectPrefix || dirName.startsWith(`${projectPrefix}${CLAUDE_PROJECT_ENCODED_SEPARATOR}`)
    );
}

function acceptsEveryClaudeProjectDir(): boolean {
  return true;
}

async function collectMatchingSessions(
  agent: AgentSearchSessionKind,
  files: readonly AgentStoreFile[],
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  located: LocatedTranscripts,
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): Promise<AgentSearchResult[]> {
  const results: AgentSearchResult[] = [];
  const seen = new Set<string>();
  const currentMetadataSessionIds = new Set<string>();
  const currentMetadataBranchAssociationCwds = new Map<string, string>();
  for (const file of files) {
    const scanned = await scanTranscript(file.path, options, adapter, located);
    if (scanned === null) continue;
    const core = scanned.core;
    if (seen.has(core.sessionId)) continue;
    const content = scanned.content;
    const candidateMetadataIsCurrent = !currentMetadataSessionIds.has(core.sessionId);
    currentMetadataSessionIds.add(core.sessionId);
    recordCurrentMetadataBranchAssociation(
      core,
      options,
      adapter,
      candidateMetadataIsCurrent,
      currentMetadataBranchAssociationCwds,
    );
    const records = transcriptRecords(adapter, content);
    const recordedScopeCwd = recordedCwdMatching(records, (cwd) => cwdMatchesSearchInputScope(cwd, options));
    if (
      scopeDecidesInclusion(options.query)
      && recordedScopeCwd === null
      && !coreCanHaveScopedSearchResult(core, options, subagentBranchAssociations)
    ) continue;
    const match = matchReasons(
      agent,
      core,
      options,
      adapter,
      {
        topLevel: topLevelBranchAssociations,
        subagent: subagentBranchAssociations,
        candidateCwd: recordedBranchAssociationCwd(records, options)
          ?? currentMetadataBranchAssociationCwds.get(core.sessionId) ?? null,
        content,
      },
    );
    if (match === null) continue;
    const effectiveCwd = match.effectiveCwd ?? recordedScopeCwd ?? core.cwd;
    if (scopeDecidesInclusion(options.query) && !cwdMatchesSearchInputScope(effectiveCwd, options)) continue;
    seen.add(core.sessionId);
    results.push({
      agent,
      sessionId: core.sessionId,
      cwd: effectiveCwd,
      sourcePath: file.path,
      modifiedAtMs: file.modifiedAtMs,
      updatedAt: core.updatedAt,
      branch: core.branch,
      matches: match.reasons,
    });
  }
  return results;
}

interface ScannedTranscript {
  readonly core: AgentSessionHead;
  readonly content: string | null;
}

/**
 * Reads a candidate's metadata head, then its text only when the locator named the transcript
 * and the selector consumes text through this adapter. A candidate the locator did not name
 * is never read past its head.
 */
async function scanTranscript(
  path: string,
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  located: LocatedTranscripts,
): Promise<ScannedTranscript | null> {
  const head = await options.fs.readHead(path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
  if (head === null) {
    return null;
  }
  const core = adapter.parseHead(head);
  if (core === null || !core.interactive) {
    return null;
  }
  if (!locatorNamed(located, path) || !textWarranted(core, options.query, adapter)) {
    return { core, content: null };
  }
  const content = await options.fs.readText(path).catch(() => null);
  return { core, content };
}

/**
 * A content selector reads its needles from the text. A session-id selector reads the located
 * transcript's records where the adapter declares a reader. A branch selector reads a located
 * transcript's records or commands, and not even those where the opening metadata alone
 * resolves it for an adapter without a record reader.
 */
function textWarranted(core: AgentSessionHead, query: AgentSearchQuery, adapter: AgentSearchAdapter): boolean {
  if (query.contentNeedles.length > 0) {
    return true;
  }
  if (query.sessionId !== null && adapter.readRecords !== null) {
    return true;
  }
  if (query.branch === null) {
    return false;
  }
  if (adapter.readRecords !== null) {
    return true;
  }
  return adapter.acceptsTranscriptCommandEvidence && !openingMetadataResolvesBranch(core, query);
}

function recordCurrentMetadataBranchAssociation(
  core: AgentSessionHead,
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  candidateMetadataIsCurrent: boolean,
  currentMetadataBranchAssociationCwds: Map<string, string>,
): void {
  if (!candidateMetadataIsCurrent) {
    return;
  }
  const branchAssociationCwd = currentMetadataBranchAssociationCwd(
    core,
    options.query.branch,
    options.branchAssociatedWorktreeRoots ?? [],
    adapter.readRecords === null,
  );
  if (branchAssociationCwd !== null && cwdMatchesSearchInputScope(branchAssociationCwd, options)) {
    currentMetadataBranchAssociationCwds.set(core.sessionId, branchAssociationCwd);
  }
}

function coreCanHaveScopedSearchResult(
  core: AgentSessionHead,
  options: AgentSearchOptions,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): boolean {
  return coreMatchesSearchInputScope(core, options)
    || subagentBranchAssociations.has(core.sessionId);
}

interface BranchAssociationContext {
  readonly topLevel: TopLevelBranchAssociations;
  readonly subagent: ReadonlyMap<string, CodexSubagentBranchAssociation>;
  readonly candidateCwd: string | null;
  readonly content: string | null;
}

function matchReasons(
  agent: AgentSearchSessionKind,
  core: AgentSessionHead,
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  association: BranchAssociationContext,
): BranchSearchMatch | null {
  if (!hasSearchSelector(options.query)) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.ALL],
      effectiveCwd: null,
    };
  }
  const metadataMatches = metadataMatchReasons(agent, core, options.query);
  if (metadataMatches === null) {
    return null;
  }
  const branchMatches = branchMetadataOrWorktreeMatchReasons(
    core,
    options.query.branch,
    association.topLevel,
    association.subagent,
    association.candidateCwd,
  );
  if (branchMatches === null && association.topLevel.commandCheckedSessionIds.has(core.sessionId)) {
    return null;
  }
  // A transcript the scan left unread carries no evidence a content read here could add.
  const resolvedBranchMatches = branchMatches ?? (
    adapter.acceptsTranscriptCommandEvidence && association.content !== null
      ? branchTranscriptCommandMatchReasons(association.content, options.query.branch)
      : null
  );
  if (resolvedBranchMatches === null) {
    return null;
  }
  const contentMatches = contentMatchReasons(association.content, options.query);
  if (contentMatches === null) {
    return null;
  }
  return {
    reasons: [...metadataMatches, ...resolvedBranchMatches.reasons, ...contentMatches],
    effectiveCwd: resolvedBranchMatches.effectiveCwd,
  };
}

/** A branch selector matches on any recorded position, not only the opening one. */
function recordedBranchAssociationCwd(
  records: readonly AgentTranscriptRecord[],
  options: AgentSearchOptions,
): string | null {
  const branch = options.query.branch;
  if (branch === null) {
    return null;
  }
  const branchCwd = recordedBranchCwd(records, branch);
  return branchCwd !== null && cwdMatchesSearchInputScope(branchCwd, options) ? branchCwd : null;
}

/** Records come only from text the scan read, which the locator bounded to its hits. */
function transcriptRecords(
  adapter: AgentSearchAdapter,
  content: string | null,
): readonly AgentTranscriptRecord[] {
  if (adapter.readRecords === null || content === null) {
    return [];
  }
  return adapter.readRecords(content);
}

/**
 * The metadata head names the branch. This answers only where one row supplies both the
 * branch and the working directory; an adapter that declares a record reader scans the
 * records instead, because its head resolves each field from the first row carrying it.
 */
function openingMetadataResolvesBranch(core: AgentSessionHead, query: AgentSearchQuery): boolean {
  return query.branch !== null && core.branch === query.branch;
}

/** Whether the invocation carries a selector the locator answers. */
function hasLocatorNeedle(query: AgentSearchQuery): boolean {
  return query.contentNeedles.length > 0 || query.sessionId !== null || query.branch !== null;
}

function coreMatchesSearchInputScope(
  core: AgentSessionHead,
  options: AgentSearchOptions,
): boolean {
  return coreMatchesSearchScope(core, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? []);
}

function cwdMatchesSearchInputScope(
  cwd: string,
  options: AgentSearchOptions,
): boolean {
  return cwdMatchesSearchScope(cwd, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? []);
}

function metadataMatchReasons(
  agent: AgentSearchSessionKind,
  core: AgentSessionHead,
  query: AgentSearchQuery,
): AgentSearchMatchReason[] | null {
  const matches: AgentSearchMatchReason[] = [];
  if (query.agent !== null) {
    if (agent !== query.agent) return null;
    matches.push(AGENT_SEARCH_MATCH_REASON.AGENT);
  }
  if (query.sessionId !== null && core.sessionId === query.sessionId) {
    matches.push(AGENT_SEARCH_MATCH_REASON.SESSION_ID);
  } else if (query.sessionId !== null) {
    return null;
  }
  return matches;
}

function contentMatchReasons(
  content: string | null,
  query: AgentSearchQuery,
): AgentSearchMatchReason[] | null {
  if (query.contentNeedles.length === 0) {
    return [];
  }
  return content === null ? null : matchingContentNeedles(content, query.contentNeedles);
}

function matchingContentNeedles(
  content: string,
  needles: readonly AgentSearchContentNeedle[],
): AgentSearchMatchReason[] | null {
  const matches = needles
    .filter((needle) => content.includes(needle.value))
    .map((needle) => needle.reason);
  return matches.length === needles.length ? matches : null;
}

function searchRecentWindowMs(query: AgentSearchQuery): number {
  return query.sinceMs ?? AGENT_SEARCH_RECENT_WINDOW_MS;
}

async function storeFiles(
  paths: readonly string[],
  fs: AgentSessionFileSystem,
  nowMs: number,
  includeAll: boolean,
  recentWindowMs: number,
): Promise<AgentStoreFile[]> {
  const files = await mapWithConcurrency(paths, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (path) => {
    const stat = await fs.stat(path).catch((): AgentSessionFileStat | null => null);
    if (stat === null) return null;
    if (!includeAll && !isRecentAgentSessionMtime(stat.mtimeMs, nowMs, recentWindowMs)) return null;
    return { path, modifiedAtMs: stat.mtimeMs };
  });
  return files
    .filter((file): file is AgentStoreFile => file !== null)
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || compareAgentSessionText(left.path, right.path));
}

function recentStoreFiles(
  files: readonly AgentStoreFile[],
  nowMs: number,
  recentWindowMs: number,
): AgentStoreFile[] {
  return files.filter((file) => isRecentAgentSessionMtime(file.modifiedAtMs, nowMs, recentWindowMs));
}

function nonFutureStoreFiles(files: readonly AgentStoreFile[], nowMs: number): AgentStoreFile[] {
  return files.filter((file) => file.modifiedAtMs <= nowMs);
}

function emptyTopLevelBranchAssociations(): TopLevelBranchAssociations {
  return {
    commandAssociatedSessionIds: new Set<string>(),
    commandCheckedSessionIds: new Set<string>(),
  };
}

function compareSearchResults(left: AgentSearchResult, right: AgentSearchResult): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) return modifiedDiff;
  return compareAgentSessionText(`${left.agent}:${left.sessionId}`, `${right.agent}:${right.sessionId}`);
}
