import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import type { AgentHomeDirs } from "./home";
import { AGENT_RESUME_LIMITS, AGENT_SESSION_KIND, AGENT_SESSION_LABEL, type AgentSessionKind } from "./protocol";
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
  isPathInsideOrEqual,
  isRecentAgentSessionMtime,
  mapWithConcurrency,
  parseClaudeHead,
  parseCodexHead,
} from "./resume";

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

export const AGENT_SEARCH_DEFAULT_LIMIT = 20;

export const AGENT_SEARCH_MATCH_REASON = {
  ALL: "all",
  PICKUP_ID: "pickup-id",
  CONTAINS: "contains",
  SESSION_ID: "session-id",
  AGENT: "agent",
  BRANCH: "branch",
} as const;

export type AgentSearchMatchReason = (typeof AGENT_SEARCH_MATCH_REASON)[keyof typeof AGENT_SEARCH_MATCH_REASON];

export interface AgentSearchContentNeedle {
  readonly reason: AgentSearchMatchReason;
  readonly value: string;
}

export interface AgentSearchQuery {
  readonly contentNeedles: readonly AgentSearchContentNeedle[];
  readonly sessionId: string | null;
  readonly branch: string | null;
  readonly agent: AgentSessionKind | null;
  readonly includeAll: boolean;
  readonly limit: number;
}

export interface AgentSearchQueryOptions {
  readonly pickupId?: string;
  readonly contains?: string;
  readonly sessionId?: string;
  readonly branch?: string;
  readonly agent?: AgentSessionKind;
  readonly all?: boolean;
  readonly limit?: number;
}

export interface AgentSearchOptions {
  readonly agentHomeDirs: AgentHomeDirs;
  readonly nowMs: number;
  readonly productScopeRoot: string;
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

type AgentHeadParser = (head: string) => AgentSessionHead | null;

export function pickupIdSearchLiteral(pickupId: string): string {
  return formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, pickupId);
}

export function agentSearchQueryFromOptions(options: AgentSearchQueryOptions): AgentSearchQuery {
  const contentNeedles: AgentSearchContentNeedle[] = [];
  if (options.pickupId !== undefined) {
    contentNeedles.push({
      reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
      value: pickupIdSearchLiteral(options.pickupId),
    });
  }
  if (options.contains !== undefined) {
    contentNeedles.push({ reason: AGENT_SEARCH_MATCH_REASON.CONTAINS, value: options.contains });
  }
  return {
    contentNeedles,
    sessionId: options.sessionId ?? null,
    branch: options.branch ?? null,
    agent: options.agent ?? null,
    includeAll: options.all === true,
    limit: options.limit ?? AGENT_SEARCH_DEFAULT_LIMIT,
  };
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

export function renderAgentSearchJson(results: readonly AgentSearchResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function renderAgentSearchList(results: readonly AgentSearchResult[]): string {
  if (results.length === 0) {
    return "No matching agent sessions found.";
  }
  return results.map((result) => {
    const updatedAt = result.updatedAt ?? new Date(result.modifiedAtMs).toISOString();
    return `${updatedAt} ${AGENT_SESSION_LABEL[result.agent]} ${result.sessionId} ${result.cwd}`;
  }).join("\n");
}

async function searchAgentStore(
  agent: AgentSessionKind,
  options: AgentSearchOptions,
): Promise<AgentSearchResult[]> {
  const paths = agent === AGENT_SESSION_KIND.CODEX
    ? await collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs)
    : await claudeTranscriptFiles(
      claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
      options.fs,
      claudeDirAcceptsProductScope(options.productScopeRoot),
    );
  const files = await storeFiles(paths, options.fs, options.nowMs, options.query.includeAll);
  const parser = agent === AGENT_SESSION_KIND.CODEX ? parseCodexHead : parseClaudeHead;
  return collectMatchingSessions(agent, files, options, parser);
}

function claudeDirAcceptsProductScope(productScopeRoot: string): (dirName: string) => boolean {
  const projectPrefix = claudeProjectDirName(productScopeRoot);
  return (dirName) =>
    dirName === projectPrefix || dirName.startsWith(`${projectPrefix}${CLAUDE_PROJECT_ENCODED_SEPARATOR}`);
}

async function collectMatchingSessions(
  agent: AgentSessionKind,
  files: readonly AgentStoreFile[],
  options: AgentSearchOptions,
  parseHead: AgentHeadParser,
): Promise<AgentSearchResult[]> {
  const results: AgentSearchResult[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) continue;
    const core = parseHead(head);
    if (core === null || !core.interactive || seen.has(core.sessionId)) continue;
    if (!coreMatchesProductScope(core, options.productScopeRoot)) continue;
    const matches = await matchReasons(agent, core, file.path, options);
    if (matches.length === 0) continue;
    seen.add(core.sessionId);
    results.push({
      agent,
      sessionId: core.sessionId,
      cwd: core.cwd,
      sourcePath: file.path,
      modifiedAtMs: file.modifiedAtMs,
      updatedAt: core.updatedAt,
      branch: core.branch,
      matches,
    });
  }
  return results;
}

async function matchReasons(
  agent: AgentSessionKind,
  core: AgentSessionHead,
  path: string,
  options: AgentSearchOptions,
): Promise<AgentSearchMatchReason[]> {
  if (!hasSearchSelector(options.query)) {
    return [AGENT_SEARCH_MATCH_REASON.ALL];
  }
  const metadataMatches = metadataMatchReasons(agent, core, options.query);
  const contentMatches = await contentMatchReasons(path, options);
  if (metadataMatches === null || contentMatches === null) {
    return [];
  }
  return [...metadataMatches, ...contentMatches];
}

function hasSearchSelector(query: AgentSearchQuery): boolean {
  return query.contentNeedles.length > 0 || query.sessionId !== null || query.branch !== null || query.agent !== null;
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
  if (query.branch !== null) {
    if (core.branch !== query.branch) return null;
    matches.push(AGENT_SEARCH_MATCH_REASON.BRANCH);
  }
  return matches;
}

async function contentMatchReasons(
  path: string,
  options: AgentSearchOptions,
): Promise<AgentSearchMatchReason[] | null> {
  if (options.query.contentNeedles.length === 0) {
    return [];
  }
  const content = await options.fs.readText(path).catch(() => null);
  return content === null ? null : matchingContentNeedles(content, options.query.contentNeedles);
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

function coreMatchesProductScope(core: AgentSessionHead, productScopeRoot: string): boolean {
  return isPathInsideOrEqual(productScopeRoot, core.cwd);
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

function compareSearchResults(left: AgentSearchResult, right: AgentSearchResult): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) return modifiedDiff;
  return `${left.agent}:${left.sessionId}`.localeCompare(`${right.agent}:${right.sessionId}`);
}
