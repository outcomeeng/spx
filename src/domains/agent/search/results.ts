import type { AgentHomeDirs } from "../home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_SEARCH_MATCH_REASON,
  AGENT_SESSION_KIND,
  type AgentSearchMatchReason,
  type AgentSessionKind,
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
  type TopLevelBranchAssociations,
} from "./branch-association";
import { type AgentSearchContentNeedle, type AgentSearchQuery, hasSearchSelector } from "./query";

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

export interface AgentSearchOptions {
  readonly agentHomeDirs: AgentHomeDirs;
  readonly nowMs: number;
  readonly productScopeRoot: string;
  readonly branchAssociatedWorktreeRoots?: readonly string[];
  readonly fs: AgentSearchFileSystem;
  readonly query: AgentSearchQuery;
}

export interface AgentSearchResult {
  readonly agent: AgentSessionKind;
  readonly sessionId: string;
  readonly cwd: string;
  readonly sourcePath: string;
  readonly modifiedAtMs: number;
  readonly updatedAt: string | null;
  readonly branch: string | null;
  readonly matches: readonly AgentSearchMatchReason[];
}

export async function searchAgentSessions(options: AgentSearchOptions): Promise<AgentSearchResult[]> {
  const selectedAgents = options.query.agent === null
    ? [AGENT_SESSION_KIND.CODEX, AGENT_SESSION_KIND.CLAUDE_CODE]
    : [options.query.agent];
  const perAgent = await Promise.all(
    selectedAgents.map((agent) => searchAgentStore(agent, options)),
  );
  return perAgent
    .flat()
    .sort(compareSearchResults)
    .slice(0, Math.max(0, options.query.limit));
}

async function searchAgentStore(
  agent: AgentSessionKind,
  options: AgentSearchOptions,
): Promise<AgentSearchResult[]> {
  const branchAssociatedRoots = options.branchAssociatedWorktreeRoots ?? [];
  const acceptsClaudeDir = claudeDirAcceptsProductScope(options.productScopeRoot, branchAssociatedRoots);
  const paths = agent === AGENT_SESSION_KIND.CODEX
    ? await collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs)
    : await claudeTranscriptFiles(
      claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
      options.fs,
      acceptsClaudeDir,
    );
  const parser = agent === AGENT_SESSION_KIND.CODEX ? parseCodexHead : parseClaudeHead;
  const needsBranchEvidence = options.query.branch !== null;
  const allFiles = needsBranchEvidence ? await storeFiles(paths, options.fs, options.nowMs, true) : [];
  const files = needsBranchEvidence
    ? options.query.includeAll ? allFiles : recentStoreFiles(allFiles, options.nowMs)
    : await storeFiles(paths, options.fs, options.nowMs, options.query.includeAll);
  const branchEvidenceFiles = needsBranchEvidence ? nonFutureStoreFiles(allFiles, options.nowMs) : [];
  const topLevelBranchAssociations = needsBranchEvidence
    ? await collectTopLevelBranchAssociations(branchEvidenceFiles, options, parser)
    : emptyTopLevelBranchAssociations();
  const subagentBranchAssociations = needsBranchEvidence && agent === AGENT_SESSION_KIND.CODEX
    ? await collectCodexSubagentBranchAssociations(branchEvidenceFiles, options)
    : new Map<string, CodexSubagentBranchAssociation>();
  return collectMatchingSessions(agent, files, options, parser, topLevelBranchAssociations, subagentBranchAssociations);
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
  agent: AgentSessionKind,
  files: readonly AgentStoreFile[],
  options: AgentSearchOptions,
  parseHead: AgentHeadParser,
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): Promise<AgentSearchResult[]> {
  const results: AgentSearchResult[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) continue;
    const core = parseHead(head);
    if (core === null || !core.interactive || seen.has(core.sessionId)) continue;
    if (!coreMatchesSearchInputScope(core, options)) continue;
    const match = await matchReasons(
      agent,
      core,
      file.path,
      options,
      topLevelBranchAssociations,
      subagentBranchAssociations,
    );
    if (match === null) continue;
    seen.add(core.sessionId);
    results.push({
      agent,
      sessionId: core.sessionId,
      cwd: match.subagentBranchAssociation?.cwd ?? core.cwd,
      sourcePath: file.path,
      modifiedAtMs: file.modifiedAtMs,
      updatedAt: core.updatedAt,
      branch: core.branch,
      matches: match.reasons,
    });
  }
  return results;
}

async function matchReasons(
  agent: AgentSessionKind,
  core: AgentSessionHead,
  path: string,
  options: AgentSearchOptions,
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): Promise<BranchSearchMatch | null> {
  if (!hasSearchSelector(options.query)) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.ALL],
      subagentBranchAssociation: null,
    };
  }
  const metadataMatches = metadataMatchReasons(agent, core, options.query);
  if (metadataMatches === null) {
    return null;
  }
  const branchAssociatedWorktreeRoots = options.branchAssociatedWorktreeRoots ?? [];
  const branchMatches = branchMetadataOrWorktreeMatchReasons(
    core,
    options.query.branch,
    branchAssociatedWorktreeRoots,
    topLevelBranchAssociations,
    subagentBranchAssociations,
  );
  if (branchMatches === null && topLevelBranchAssociations.commandCheckedSessionIds.has(core.sessionId)) {
    return null;
  }
  const needsTranscriptContent = branchMatches === null || options.query.contentNeedles.length > 0;
  const content = needsTranscriptContent ? await options.fs.readText(path).catch(() => null) : undefined;
  if (content === null) {
    return null;
  }
  const resolvedBranchMatches = branchMatches ?? branchTranscriptCommandMatchReasons(content, options.query.branch);
  if (resolvedBranchMatches === null) {
    return null;
  }
  const contentMatches = contentMatchReasons(content, options.query);
  if (contentMatches === null) {
    return null;
  }
  return {
    reasons: [...metadataMatches, ...resolvedBranchMatches.reasons, ...contentMatches],
    subagentBranchAssociation: resolvedBranchMatches.subagentBranchAssociation,
  };
}

function coreMatchesSearchInputScope(
  core: AgentSessionHead,
  options: AgentSearchOptions,
): boolean {
  return coreMatchesSearchScope(core, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? []);
}

function metadataMatchReasons(
  agent: AgentSessionKind,
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
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || left.path.localeCompare(right.path));
}

function recentStoreFiles(files: readonly AgentStoreFile[], nowMs: number): AgentStoreFile[] {
  return files.filter((file) => isRecentAgentSessionMtime(file.modifiedAtMs, nowMs));
}

function nonFutureStoreFiles(files: readonly AgentStoreFile[], nowMs: number): AgentStoreFile[] {
  return files.filter((file) => file.modifiedAtMs <= nowMs);
}

function emptyTopLevelBranchAssociations(): TopLevelBranchAssociations {
  return {
    associatedSessionIds: new Set<string>(),
    commandCheckedSessionIds: new Set<string>(),
  };
}

function compareSearchResults(left: AgentSearchResult, right: AgentSearchResult): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) return modifiedDiff;
  return `${left.agent}:${left.sessionId}`.localeCompare(`${right.agent}:${right.sessionId}`);
}
