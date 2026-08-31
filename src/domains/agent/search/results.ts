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
import { type AgentSearchContentNeedle, type AgentSearchQuery, hasSearchSelector } from "./query";
import {
  type AgentTranscriptRecord,
  parseClaudeTranscriptRecords,
  recordedBranchCwd,
  recordedCwdMatching,
  type TranscriptRecordReader,
} from "./transcript-records";

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

interface AgentSearchAdapter {
  readonly collectPaths: (
    options: AgentSearchOptions,
    acceptsClaudeDir: (dirName: string) => boolean,
  ) => Promise<readonly string[]>;
  readonly parseHead: AgentHeadParser;
  readonly readRecords: TranscriptRecordReader | null;
  readonly acceptsTranscriptCommandEvidence: boolean;
  readonly acceptsCodexSubagentEvidence: boolean;
}

const AGENT_SEARCH_ADAPTER_REGISTRY: Readonly<Record<AgentSearchSessionKind, AgentSearchAdapter>> = {
  [AGENT_SESSION_KIND.CODEX]: {
    collectPaths: (options) => collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs),
    parseHead: parseCodexHead,
    readRecords: null,
    acceptsTranscriptCommandEvidence: true,
    acceptsCodexSubagentEvidence: true,
  },
  [AGENT_SESSION_KIND.CLAUDE_CODE]: {
    collectPaths: (options, acceptsClaudeDir) =>
      claudeTranscriptFiles(
        claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
        options.fs,
        acceptsClaudeDir,
      ),
    parseHead: parseClaudeHead,
    readRecords: parseClaudeTranscriptRecords,
    acceptsTranscriptCommandEvidence: true,
    acceptsCodexSubagentEvidence: false,
  },
  [AGENT_SESSION_KIND.PI]: {
    collectPaths: (options) => collectJsonlFiles(options.agentHomeDirs.piSessions, options.fs),
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
  const paths = await adapter.collectPaths(options, claudeDirAdmission(options, adapter));
  const parser = adapter.parseHead;
  const needsBranchEvidence = options.query.branch !== null;
  const recentWindowMs = searchRecentWindowMs(options.query);
  const allFiles = needsBranchEvidence ? await storeFiles(paths, options.fs, options.nowMs, true, recentWindowMs) : [];
  const files = needsBranchEvidence
    ? options.query.includeAll ? allFiles : recentStoreFiles(allFiles, options.nowMs, recentWindowMs)
    : await storeFiles(paths, options.fs, options.nowMs, options.query.includeAll, recentWindowMs);
  const branchEvidenceFiles = needsBranchEvidence ? nonFutureStoreFiles(allFiles, options.nowMs) : [];
  const topLevelBranchAssociations = needsBranchEvidence && adapter.acceptsTranscriptCommandEvidence
    ? await collectTopLevelBranchAssociations(branchEvidenceFiles, options, parser)
    : emptyTopLevelBranchAssociations();
  const subagentBranchAssociations = needsBranchEvidence && adapter.acceptsCodexSubagentEvidence
    ? await collectCodexSubagentBranchAssociations(branchEvidenceFiles, options)
    : new Map<string, CodexSubagentBranchAssociation>();
  return collectMatchingSessions(
    agent,
    files,
    options,
    adapter,
    topLevelBranchAssociations,
    subagentBranchAssociations,
  );
}

/**
 * Only a selector read from recorded content can match a session the store filed elsewhere,
 * so only that selector needs every directory admitted. Every other query resolves scope from
 * the opening working directory alone — the same value the directory name encodes — so there
 * the name excludes nothing the scope check would keep.
 */
function claudeDirAdmission(options: AgentSearchOptions, adapter: AgentSearchAdapter): (dirName: string) => boolean {
  if (requiresTranscriptContent(options.query, adapter)) {
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
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): Promise<AgentSearchResult[]> {
  const results: AgentSearchResult[] = [];
  const seen = new Set<string>();
  const currentMetadataSessionIds = new Set<string>();
  const currentMetadataBranchAssociationCwds = new Map<string, string>();
  for (const file of files) {
    const scanned = await scanTranscript(file.path, options, adapter);
    if (scanned === null) continue;
    const core = scanned.core;
    if (seen.has(core.sessionId)) continue;
    const content = scanned.content;
    const candidateMetadataIsCurrent = !currentMetadataSessionIds.has(core.sessionId);
    currentMetadataSessionIds.add(core.sessionId);
    recordCurrentMetadataBranchAssociation(
      core,
      options,
      candidateMetadataIsCurrent,
      currentMetadataBranchAssociationCwds,
    );
    const records = transcriptRecords(adapter, content, options.query);
    const recordedScopeCwd = recordedCwdMatching(records, (cwd) => cwdMatchesSearchInputScope(cwd, options));
    if (
      recordedScopeCwd === null
      && !coreCanHaveScopedSearchResult(core, options, subagentBranchAssociations)
    ) continue;
    const match = await matchReasons(
      agent,
      core,
      file.path,
      options,
      adapter,
      topLevelBranchAssociations,
      subagentBranchAssociations,
      currentMetadataBranchAssociationCwds.get(core.sessionId)
        ?? recordedBranchAssociationCwd(records, options),
      content,
    );
    if (match === null) continue;
    const effectiveCwd = match.effectiveCwd ?? recordedScopeCwd ?? core.cwd;
    if (!cwdMatchesSearchInputScope(effectiveCwd, options)) continue;
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
 * Locates the selector in raw bytes before any structural read, so a transcript that
 * cannot match is never parsed for session metadata.
 */
async function scanTranscript(
  path: string,
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
): Promise<ScannedTranscript | null> {
  // A content needle decides candidacy from raw bytes, so it is scanned before any
  // structural read. A branch selector cannot be, so its content read waits until the
  // opening metadata has had its chance to answer.
  const scanFirst = options.query.contentNeedles.length > 0;
  const scanned = scanFirst ? await options.fs.readText(path).catch(() => null) : null;
  if (scanned !== null && !transcriptCarriesSelectorEvidence(scanned, options.query)) {
    return null;
  }
  const head = await options.fs.readHead(path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
  if (head === null) {
    return null;
  }
  const core = adapter.parseHead(head);
  if (core === null || !core.interactive) {
    return null;
  }
  if (scanned !== null || !requiresTranscriptContent(options.query, adapter)) {
    return { core, content: scanned };
  }
  if (openingMetadataResolvesBranch(core, options.query)) {
    return { core, content: null };
  }
  return { core, content: await options.fs.readText(path).catch(() => null) };
}

function recordCurrentMetadataBranchAssociation(
  core: AgentSessionHead,
  options: AgentSearchOptions,
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

async function matchReasons(
  agent: AgentSearchSessionKind,
  core: AgentSessionHead,
  path: string,
  options: AgentSearchOptions,
  adapter: AgentSearchAdapter,
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
  candidateMetadataBranchAssociationCwd: string | null,
  prefetchedContent: string | null,
): Promise<BranchSearchMatch | null> {
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
    topLevelBranchAssociations,
    subagentBranchAssociations,
    candidateMetadataBranchAssociationCwd,
  );
  if (branchMatches === null && topLevelBranchAssociations.commandCheckedSessionIds.has(core.sessionId)) {
    return null;
  }
  const requiresContent = (branchMatches === null && adapter.acceptsTranscriptCommandEvidence)
    || options.query.contentNeedles.length > 0;
  const content = prefetchedContent
    ?? (requiresContent ? await options.fs.readText(path).catch(() => null) : undefined);
  if (content === null) {
    return null;
  }
  const resolvedBranchMatches = branchMatches ?? (
    adapter.acceptsTranscriptCommandEvidence
      ? branchTranscriptCommandMatchReasons(content, options.query.branch)
      : null
  );
  if (resolvedBranchMatches === null) {
    return null;
  }
  const contentMatches = contentMatchReasons(content, options.query);
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

/**
 * Records are parsed only when the raw bytes can support the selector: a branch the
 * transcript never names cannot appear in any of its records.
 */
function transcriptRecords(
  adapter: AgentSearchAdapter,
  content: string | null,
  query: AgentSearchQuery,
): readonly AgentTranscriptRecord[] {
  if (adapter.readRecords === null || content === null) {
    return [];
  }
  if (query.branch !== null && !content.includes(query.branch)) {
    return [];
  }
  return adapter.readRecords(content);
}

/**
 * A selector-free listing resolves from opening metadata alone, so it never decodes a
 * transcript. Only a selector that reads recorded content pays that cost.
 */
/** The opening record already names the branch, so no later position needs reading. */
function openingMetadataResolvesBranch(core: AgentSessionHead, query: AgentSearchQuery): boolean {
  return query.branch !== null && core.branch === query.branch;
}

function requiresTranscriptContent(query: AgentSearchQuery, adapter: AgentSearchAdapter): boolean {
  if (!hasSearchSelector(query)) {
    return false;
  }
  return query.contentNeedles.length > 0
    || (query.branch !== null && (adapter.readRecords !== null || adapter.acceptsTranscriptCommandEvidence));
}

/**
 * Byte-scan admission. Only a content-needle-only query is decidable from raw bytes:
 * branch evidence also arrives from same-product worktree roots and accepted transcript
 * commands, and one transcript's metadata can associate a branch for a sibling transcript
 * of the same session, so a branch selector admits every candidate.
 */
function transcriptCarriesSelectorEvidence(content: string, query: AgentSearchQuery): boolean {
  if (query.contentNeedles.length === 0 || query.branch !== null) {
    return true;
  }
  return query.contentNeedles.some((needle) => content.includes(needle.value));
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
  content: string | undefined,
  query: AgentSearchQuery,
): AgentSearchMatchReason[] | null {
  if (query.contentNeedles.length === 0) {
    return [];
  }
  return content === undefined ? null : matchingContentNeedles(content, query.contentNeedles);
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
