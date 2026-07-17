import type { AgentHomeDirs } from "../home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_SEARCH_MATCH_REASON,
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

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

interface AgentSearchAdapter {
  readonly collectPaths: (
    options: AgentSearchOptions,
    acceptsClaudeDir: (dirName: string) => boolean,
  ) => Promise<readonly string[]>;
  readonly parseHead: AgentHeadParser;
  readonly acceptsTranscriptCommandEvidence: boolean;
  readonly acceptsCodexSubagentEvidence: boolean;
}

const AGENT_SEARCH_ADAPTER_REGISTRY: Readonly<Record<AgentSearchSessionKind, AgentSearchAdapter>> = {
  [AGENT_SESSION_KIND.CODEX]: {
    collectPaths: (options) => collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs),
    parseHead: parseCodexHead,
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
    acceptsTranscriptCommandEvidence: true,
    acceptsCodexSubagentEvidence: false,
  },
  [AGENT_SESSION_KIND.PI]: {
    collectPaths: (options) => collectJsonlFiles(options.agentHomeDirs.piSessions, options.fs),
    parseHead: parsePiHead,
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
  const branchAssociatedRoots = options.branchAssociatedWorktreeRoots ?? [];
  const adapter = AGENT_SEARCH_ADAPTER_REGISTRY[agent];
  const paths = await adapter.collectPaths(
    options,
    claudeDirAcceptsProductScope(options.productScopeRoot, branchAssociatedRoots),
  );
  const parser = adapter.parseHead;
  const needsBranchEvidence = options.query.branch !== null;
  const allFiles = needsBranchEvidence ? await storeFiles(paths, options.fs, options.nowMs, true) : [];
  const files = needsBranchEvidence
    ? options.query.includeAll ? allFiles : recentStoreFiles(allFiles, options.nowMs)
    : await storeFiles(paths, options.fs, options.nowMs, options.query.includeAll);
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

function claudeDirAcceptsProductScope(
  productScopeRoot: string,
  branchAssociatedWorktreeRoots: readonly string[],
): (dirName: string) => boolean {
  const projectPrefixes = [productScopeRoot, ...branchAssociatedWorktreeRoots].map(claudeProjectDirName);
  return (dirName) =>
    projectPrefixes.some((projectPrefix) =>
      dirName === projectPrefix || dirName.startsWith(`${projectPrefix}${CLAUDE_PROJECT_ENCODED_SEPARATOR}`)
    );
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
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) continue;
    const core = adapter.parseHead(head);
    if (core === null || !core.interactive || seen.has(core.sessionId)) continue;
    const candidateMetadataIsCurrent = !currentMetadataSessionIds.has(core.sessionId);
    currentMetadataSessionIds.add(core.sessionId);
    recordCurrentMetadataBranchAssociation(
      core,
      options,
      candidateMetadataIsCurrent,
      currentMetadataBranchAssociationCwds,
    );
    if (!coreCanHaveScopedSearchResult(core, options, subagentBranchAssociations)) continue;
    const match = await matchReasons(
      agent,
      core,
      file.path,
      options,
      adapter,
      topLevelBranchAssociations,
      subagentBranchAssociations,
      currentMetadataBranchAssociationCwds.get(core.sessionId) ?? null,
    );
    if (match === null) continue;
    const effectiveCwd = match.effectiveCwd ?? core.cwd;
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
  const needsTranscriptContent = (branchMatches === null && adapter.acceptsTranscriptCommandEvidence)
    || options.query.contentNeedles.length > 0;
  const content = needsTranscriptContent ? await options.fs.readText(path).catch(() => null) : undefined;
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

async function storeFiles(
  paths: readonly string[],
  fs: AgentSessionFileSystem,
  nowMs: number,
  includeAll: boolean,
): Promise<AgentStoreFile[]> {
  const files = await mapWithConcurrency(paths, AGENT_RESUME_LIMITS.READ_CONCURRENCY, async (path) => {
    const stat = await fs.stat(path).catch((): AgentSessionFileStat | null => null);
    if (stat === null) return null;
    if (!includeAll && !isRecentAgentSessionMtime(stat.mtimeMs, nowMs)) return null;
    return { path, modifiedAtMs: stat.mtimeMs };
  });
  return files
    .filter((file): file is AgentStoreFile => file !== null)
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || compareAgentSessionText(left.path, right.path));
}

function recentStoreFiles(files: readonly AgentStoreFile[], nowMs: number): AgentStoreFile[] {
  return files.filter((file) => isRecentAgentSessionMtime(file.modifiedAtMs, nowMs));
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
