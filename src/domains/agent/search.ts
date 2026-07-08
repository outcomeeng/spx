import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import type { AgentHomeDirs } from "./home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_LABEL,
  AGENT_SESSION_ROW_TYPE,
  AGENT_TRANSCRIPT_CODEX_OUTPUT,
  AGENT_TRANSCRIPT_CONTENT_TYPE,
  AGENT_TRANSCRIPT_GIT_COMMAND,
  AGENT_TRANSCRIPT_PAYLOAD_TYPE,
  AGENT_TRANSCRIPT_TOOL_NAME,
  type AgentSearchMatchReason,
  type AgentSessionKind,
} from "./protocol";
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
import { firstString, isRecord, parseJsonObject, valueAtPath } from "./transcript-json";

export interface AgentSearchFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

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

type AgentHeadParser = (head: string) => AgentSessionHead | null;

interface CodexSubagentBranchAssociation {
  readonly cwd: string;
}

type BranchAssociatedSessionIds = ReadonlySet<string>;

interface AgentSearchMatch {
  readonly reasons: readonly AgentSearchMatchReason[];
  readonly subagentBranchAssociation: CodexSubagentBranchAssociation | null;
}

interface BranchSearchMatch {
  readonly reasons: readonly AgentSearchMatchReason[];
  readonly subagentBranchAssociation: CodexSubagentBranchAssociation | null;
}

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
  const branchAssociatedRoots = options.branchAssociatedWorktreeRoots ?? [];
  const acceptsClaudeDir = options.query.branch === null
    ? claudeDirAcceptsProductScope(options.productScopeRoot, branchAssociatedRoots)
    : () => true;
  const paths = agent === AGENT_SESSION_KIND.CODEX
    ? await collectJsonlFiles(codexSessionStoreDir(options.agentHomeDirs.codex), options.fs)
    : await claudeTranscriptFiles(
      claudeCodeSessionStoreDir(options.agentHomeDirs.claudeCode),
      options.fs,
      acceptsClaudeDir,
    );
  const allFiles = await storeFiles(paths, options.fs, options.nowMs, true);
  const files = options.query.includeAll ? allFiles : recentStoreFiles(allFiles, options.nowMs);
  const parser = agent === AGENT_SESSION_KIND.CODEX ? parseCodexHead : parseClaudeHead;
  const branchAssociatedSessionIds = await collectTopLevelBranchAssociations(allFiles, options, parser);
  const subagentBranchAssociations = agent === AGENT_SESSION_KIND.CODEX
    ? await collectCodexSubagentBranchAssociations(allFiles, options)
    : new Map<string, CodexSubagentBranchAssociation>();
  return collectMatchingSessions(agent, files, options, parser, branchAssociatedSessionIds, subagentBranchAssociations);
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
  branchAssociatedSessionIds: BranchAssociatedSessionIds,
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
      branchAssociatedSessionIds,
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
  branchAssociatedSessionIds: BranchAssociatedSessionIds,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): Promise<AgentSearchMatch | null> {
  if (!hasSearchSelector(options.query)) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.ALL],
      subagentBranchAssociation: null,
    };
  }
  const metadataMatches = metadataMatchReasons(
    agent,
    core,
    options.query,
  );
  if (metadataMatches === null) {
    return null;
  }
  const branchMatches = branchMetadataOrWorktreeMatchReasons(
    core,
    options,
    branchAssociatedSessionIds,
    subagentBranchAssociations,
  );
  const needsTranscriptContent = branchMatches === null || options.query.contentNeedles.length > 0;
  const content = needsTranscriptContent ? await options.fs.readText(path).catch(() => null) : undefined;
  if (content === null) {
    return null;
  }
  const resolvedBranchMatches = branchMatches ?? branchTranscriptCommandMatchReasons(content, options);
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

function hasSearchSelector(query: AgentSearchQuery): boolean {
  return query.contentNeedles.length > 0 || query.sessionId !== null || query.branch !== null || query.agent !== null;
}

function coreMatchesSearchInputScope(
  core: AgentSessionHead,
  options: AgentSearchOptions,
): boolean {
  return options.query.branch !== null
    || coreMatchesSearchScope(core, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? []);
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

function branchMetadataOrWorktreeMatchReasons(
  core: AgentSessionHead,
  options: AgentSearchOptions,
  branchAssociatedSessionIds: BranchAssociatedSessionIds,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
): BranchSearchMatch | null {
  const branch = options.query.branch;
  if (branch === null) {
    return {
      reasons: [],
      subagentBranchAssociation: null,
    };
  }
  if (core.branch === branch) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
      subagentBranchAssociation: null,
    };
  }
  const branchAssociatedWorktreeRoots = options.branchAssociatedWorktreeRoots ?? [];
  if (branchAssociatedWorktreeRoots.some((root) => isPathInsideOrEqual(root, core.cwd))) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
      subagentBranchAssociation: null,
    };
  }
  if (branchAssociatedSessionIds.has(core.sessionId)) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
      subagentBranchAssociation: null,
    };
  }
  const subagentBranchAssociation = subagentBranchAssociations.get(core.sessionId) ?? null;
  if (subagentBranchAssociation !== null) {
    return {
      reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
      subagentBranchAssociation,
    };
  }
  return null;
}

async function collectTopLevelBranchAssociations(
  files: readonly AgentStoreFile[],
  options: AgentSearchOptions,
  parseHead: AgentHeadParser,
): Promise<BranchAssociatedSessionIds> {
  const branch = options.query.branch;
  const associated = new Set<string>();
  if (branch === null) {
    return associated;
  }
  for (const file of files) {
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) {
      continue;
    }
    const core = parseHead(head);
    if (core === null || !core.interactive || core.subagent) {
      continue;
    }
    if (core.branch === branch) {
      associated.add(core.sessionId);
      continue;
    }
    const content = await options.fs.readText(file.path).catch(() => null);
    if (content !== null && transcriptHasAcceptedBranchCommand(content, branch)) {
      associated.add(core.sessionId);
    }
  }
  return associated;
}

async function collectCodexSubagentBranchAssociations(
  files: readonly AgentStoreFile[],
  options: AgentSearchOptions,
): Promise<ReadonlyMap<string, CodexSubagentBranchAssociation>> {
  const branch = options.query.branch;
  const associated = new Map<string, CodexSubagentBranchAssociation>();
  if (branch === null) {
    return associated;
  }
  for (const file of files) {
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) {
      continue;
    }
    const core = parseCodexHead(head);
    if (core === null || !core.subagent) {
      continue;
    }
    const branchMetadataMatches = core.branch === branch;
    if (branchMetadataMatches) {
      addCodexSubagentBranchAssociation(associated, core);
      continue;
    }
    const content = await options.fs.readText(file.path).catch(() => null);
    if (content !== null && transcriptHasAcceptedBranchCommand(content, branch)) {
      addCodexSubagentBranchAssociation(associated, core);
    }
  }
  return associated;
}

function addCodexSubagentBranchAssociation(
  associated: Map<string, CodexSubagentBranchAssociation>,
  core: AgentSessionHead,
): void {
  if (associated.has(core.sessionId)) {
    return;
  }
  associated.set(core.sessionId, {
    cwd: core.cwd,
  });
}

function branchTranscriptCommandMatchReasons(
  content: string | undefined,
  options: AgentSearchOptions,
): BranchSearchMatch | null {
  const branch = options.query.branch;
  if (branch === null) {
    return {
      reasons: [],
      subagentBranchAssociation: null,
    };
  }
  return content !== undefined && transcriptHasAcceptedBranchCommand(content, branch)
    ? {
      reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
      subagentBranchAssociation: null,
    }
    : null;
}

export function transcriptHasAcceptedBranchCommand(content: string, branch: string): boolean {
  return transcriptBranchCommandEvidence(content).some((evidence) =>
    !evidence.failed && gitCommandAssociatesBranch(evidence.words, branch)
  );
}

interface TranscriptBranchCommandEvidence {
  readonly words: readonly string[];
  failed: boolean;
}

function transcriptBranchCommandEvidence(content: string): readonly TranscriptBranchCommandEvidence[] {
  const evidence: TranscriptBranchCommandEvidence[] = [];
  const codexCalls = new Map<string, TranscriptBranchCommandEvidence>();
  const claudeToolUses = new Map<string, TranscriptBranchCommandEvidence>();
  const failedCodexCallIds = new Set<string>();
  const failedClaudeToolUseIds = new Set<string>();
  for (const line of content.split("\n")) {
    const row = parseJsonObject(line);
    if (row === null) {
      continue;
    }
    collectCodexCommandEvidence(row, evidence, codexCalls, failedCodexCallIds);
    collectClaudeCommandEvidence(row, evidence, claudeToolUses, failedClaudeToolUseIds);
  }
  return evidence;
}

function collectCodexCommandEvidence(
  row: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  calls: Map<string, TranscriptBranchCommandEvidence>,
  failedCallIds: Set<string>,
): void {
  if (firstString(row, [[AGENT_SESSION_JSON_FIELDS.TYPE]]) !== AGENT_SESSION_ROW_TYPE.CODEX_RESPONSE_ITEM) {
    return;
  }
  const payload = valueAtPath(row, [AGENT_SESSION_JSON_FIELDS.PAYLOAD]);
  if (!isRecord(payload)) {
    return;
  }
  const payloadType = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.TYPE]]);
  if (payloadType === AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL) {
    const command = codexFunctionCallWords(payload);
    if (command === null) {
      return;
    }
    const rowEvidence: TranscriptBranchCommandEvidence = {
      words: command,
      failed: false,
    };
    const callId = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.CALL_ID]]);
    if (callId !== null) {
      rowEvidence.failed = failedCallIds.has(callId);
      calls.set(callId, rowEvidence);
    }
    evidence.push(rowEvidence);
    return;
  }
  if (payloadType !== AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL_OUTPUT) {
    return;
  }
  const callId = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.CALL_ID]]);
  if (callId === null || !codexFunctionCallOutputFailed(payload)) {
    return;
  }
  failedCallIds.add(callId);
  const command = calls.get(callId);
  if (command !== undefined) {
    command.failed = true;
  }
}

function codexFunctionCallWords(payload: Record<string, unknown>): readonly string[] | null {
  const toolName = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.NAME]]);
  if (toolName !== AGENT_TRANSCRIPT_TOOL_NAME.CODEX_EXEC_COMMAND) {
    return null;
  }
  const rawArguments = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.ARGUMENTS]]);
  if (rawArguments === null) {
    return null;
  }
  const args = parseJsonObject(rawArguments);
  if (args === null) {
    return null;
  }
  const command = firstString(args, [
    [AGENT_SESSION_JSON_FIELDS.CMD],
    [AGENT_SESSION_JSON_FIELDS.COMMAND],
  ]);
  if (command !== null) {
    return shellWords(command);
  }
  const commandArgs = valueAtPath(args, [AGENT_SESSION_JSON_FIELDS.ARGS]);
  return stringArray(commandArgs);
}

const CODEX_OUTPUT_EXIT_CODE_PATTERN = new RegExp(
  String.raw`${AGENT_TRANSCRIPT_CODEX_OUTPUT.PROCESS_EXITED_WITH_CODE}\s+(\d+)`,
  "u",
);

function codexFunctionCallOutputFailed(payload: Record<string, unknown>): boolean {
  const output = firstString(payload, [[AGENT_SESSION_JSON_FIELDS.OUTPUT]]);
  if (output === null) {
    return false;
  }
  const match = CODEX_OUTPUT_EXIT_CODE_PATTERN.exec(output);
  return match !== null && Number(match[1]) !== 0;
}

function collectClaudeCommandEvidence(
  row: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  failedToolUseIds: Set<string>,
): void {
  const content = valueAtPath(row, [AGENT_SESSION_JSON_FIELDS.MESSAGE, AGENT_SESSION_JSON_FIELDS.CONTENT]);
  if (!Array.isArray(content)) {
    return;
  }
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }
    const itemType = firstString(item, [[AGENT_SESSION_JSON_FIELDS.TYPE]]);
    if (itemType === AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_USE) {
      collectClaudeToolUse(item, evidence, toolUses, failedToolUseIds);
    } else if (itemType === AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_RESULT) {
      collectClaudeToolResult(item, toolUses, failedToolUseIds);
    }
  }
}

function collectClaudeToolUse(
  item: Record<string, unknown>,
  evidence: TranscriptBranchCommandEvidence[],
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  failedToolUseIds: Set<string>,
): void {
  const toolName = firstString(item, [[AGENT_SESSION_JSON_FIELDS.NAME]]);
  if (toolName !== AGENT_TRANSCRIPT_TOOL_NAME.CLAUDE_BASH) {
    return;
  }
  const command = firstString(item, [[AGENT_SESSION_JSON_FIELDS.INPUT, AGENT_SESSION_JSON_FIELDS.COMMAND]]);
  if (command === null) {
    return;
  }
  const rowEvidence: TranscriptBranchCommandEvidence = {
    words: shellWords(command),
    failed: false,
  };
  const toolUseId = firstString(item, [[AGENT_SESSION_JSON_FIELDS.ID]]);
  if (toolUseId !== null) {
    rowEvidence.failed = failedToolUseIds.has(toolUseId);
    toolUses.set(toolUseId, rowEvidence);
  }
  evidence.push(rowEvidence);
}

function collectClaudeToolResult(
  item: Record<string, unknown>,
  toolUses: Map<string, TranscriptBranchCommandEvidence>,
  failedToolUseIds: Set<string>,
): void {
  if (valueAtPath(item, [AGENT_SESSION_JSON_FIELDS.IS_ERROR]) !== true) {
    return;
  }
  const toolUseId = firstString(item, [[AGENT_SESSION_JSON_FIELDS.TOOL_USE_ID]]);
  if (toolUseId === null) {
    return;
  }
  failedToolUseIds.add(toolUseId);
  const command = toolUses.get(toolUseId);
  if (command !== undefined) {
    command.failed = true;
  }
}

function gitCommandAssociatesBranch(words: readonly string[], branch: string): boolean {
  return shellSuccessProvingCommandSegments(words).some((segment) => {
    const gitCommand = normalizeGitCommandSegment(segment);
    if (gitCommand === null) {
      return false;
    }
    const args = gitCommand.slice(1);
    return gitSwitchCommandAssociatesBranch(args, branch)
      || gitCheckoutCommandAssociatesBranch(args, branch)
      || gitWorktreeAddCommandAssociatesBranch(args, branch);
  });
}

function gitSwitchCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(1), SWITCH_CREATE_FLAGS, SWITCH_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length <= 1;
  }
  return parsed.positionals.length === 1 && positionalBranchMatches(parsed.positionals[0], parsed, branch);
}

function gitCheckoutCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(1), CHECKOUT_CREATE_FLAGS, CHECKOUT_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length <= 1;
  }
  return parsed.positionals.length === 1 && positionalBranchMatches(parsed.positionals[0], parsed, branch);
}

function gitWorktreeAddCommandAssociatesBranch(args: readonly string[], branch: string): boolean {
  if (
    args[0] !== AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE
    || args[1] !== AGENT_TRANSCRIPT_GIT_COMMAND.ADD
  ) {
    return false;
  }
  const parsed = parseGitBranchArgs(args.slice(2), WORKTREE_CREATE_FLAGS, WORKTREE_ALLOWED_OPTIONS);
  if (parsed.invalid) {
    return false;
  }
  if (parsed.createdBranch !== null) {
    return parsed.createdBranch === branch && parsed.positionals.length >= 1 && parsed.positionals.length <= 2;
  }
  return parsed.positionals.length === 2 && parsed.positionals[1] === branch;
}

interface ParsedGitBranchArgs {
  readonly createdBranch: string | null;
  readonly positionals: readonly string[];
  readonly usesTrack: boolean;
  readonly invalid: boolean;
}

interface GitAllowedOptions {
  readonly flags: readonly string[];
  readonly valueFlags: readonly string[];
  readonly optionalValueFlags: readonly string[];
}

const GIT_OPTION_CONSUMPTION = {
  INVALID: "invalid",
  NOT_ALLOWED: "not-allowed",
} as const;

type GitOptionConsumption = number | (typeof GIT_OPTION_CONSUMPTION)[keyof typeof GIT_OPTION_CONSUMPTION];

interface GitCreateBranchParse {
  readonly branch: string;
  readonly consumed: number;
}

const SWITCH_CREATE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG,
] as const;

const CHECKOUT_CREATE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT,
] as const;

const WORKTREE_CREATE_FLAGS = CHECKOUT_CREATE_FLAGS;

const CHECKOUT_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_INHERIT,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERLAY,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERLAY,
  AGENT_TRANSCRIPT_GIT_COMMAND.PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_REFLOG_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RECURSE_SUBMODULES,
] as const;

const CHECKOUT_ALLOWED_VALUE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT,
] as const;

const CHECKOUT_ALLOWED_OPTIONAL_VALUE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES,
] as const;

const CHECKOUT_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: CHECKOUT_ALLOWED_FLAGS,
  valueFlags: CHECKOUT_ALLOWED_VALUE_FLAGS,
  optionalValueFlags: CHECKOUT_ALLOWED_OPTIONAL_VALUE_FLAGS,
};

const SWITCH_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_INHERIT,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.DISCARD_CHANGES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_DISCARD_CHANGES,
  AGENT_TRANSCRIPT_GIT_COMMAND.PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_PROGRESS,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE,
  AGENT_TRANSCRIPT_GIT_COMMAND.MERGE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_OVERWRITE_IGNORE,
  AGENT_TRANSCRIPT_GIT_COMMAND.IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_IGNORE_OTHER_WORKTREES,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RECURSE_SUBMODULES,
] as const;

const SWITCH_ALLOWED_VALUE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT,
] as const;

const SWITCH_ALLOWED_OPTIONAL_VALUE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES,
] as const;

const SWITCH_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: SWITCH_ALLOWED_FLAGS,
  valueFlags: SWITCH_ALLOWED_VALUE_FLAGS,
  optionalValueFlags: SWITCH_ALLOWED_OPTIONAL_VALUE_FLAGS,
};

const WORKTREE_ALLOWED_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE,
  AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.TRACK,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET,
  AGENT_TRANSCRIPT_GIT_COMMAND.QUIET_SHORT,
  AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT_WORKTREE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_CHECKOUT_WORKTREE,
  AGENT_TRANSCRIPT_GIT_COMMAND.LOCK,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_LOCK,
  AGENT_TRANSCRIPT_GIT_COMMAND.GUESS_REMOTE,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_GUESS_REMOTE,
  AGENT_TRANSCRIPT_GIT_COMMAND.RELATIVE_PATHS,
  AGENT_TRANSCRIPT_GIT_COMMAND.NO_RELATIVE_PATHS,
] as const;

const WORKTREE_ALLOWED_VALUE_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.REASON,
] as const;

const WORKTREE_ALLOWED_OPTIONS: GitAllowedOptions = {
  flags: WORKTREE_ALLOWED_FLAGS,
  valueFlags: WORKTREE_ALLOWED_VALUE_FLAGS,
  optionalValueFlags: [],
};

const DISALLOWED_BRANCH_ASSOCIATION_FLAGS = [
  AGENT_TRANSCRIPT_GIT_COMMAND.DETACH,
  AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN,
  AGENT_TRANSCRIPT_GIT_COMMAND.PATHSPEC_SEPARATOR,
] as const;

const SHELL_COMMAND_SEPARATOR = {
  SEQUENCE: ";",
} as const;

const SHELL_OPERATOR_AND = "&&";
const SHELL_OPERATOR_OR = "||";
const SHELL_OPERATOR_AMPERSAND = "&";
const SHELL_OPERATOR_PIPE = "|";
const SHELL_ENV_COMMAND = "env";
const SHELL_COMMAND_WRAPPER_COMMAND = "command";
const SHELL_SUDO_COMMAND = "sudo";
const SHELL_BOURNE_COMMAND = "sh";
const SHELL_BASH_COMMAND = "bash";
const SHELL_COMMAND_STRING_FLAG = "-c";
const SHELL_LOGIN_COMMAND_STRING_FLAG = "-lc";
const SHELL_ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*$/u;
const SHELL_REDIRECTION_PATTERN = /^\d*(?:>>?|<<<?|>&|<&|&>|&>>)$/u;
const SHELL_DUPLICATED_DESCRIPTOR_PATTERN = /^\d*(?:>>?|<<<?|>&|<&|&>|&>>)&?\d+$/u;

function shellSuccessProvingCommandSegments(words: readonly string[]): readonly (readonly string[])[] {
  const segments: string[][] = [[]];
  for (const word of words) {
    if (isShellUnsafeSuccessSeparator(word)) {
      return [];
    }
    if (word === SHELL_OPERATOR_AND) {
      segments.push([]);
      continue;
    }
    segments[segments.length - 1].push(word);
  }
  return segments.filter((segment) => segment.length > 0);
}

function normalizeGitCommandSegment(words: readonly string[]): readonly string[] | null {
  let index = 0;
  while (index < words.length) {
    if (words[index] === SHELL_ENV_COMMAND || SHELL_ENV_ASSIGNMENT_PATTERN.test(words[index])) {
      index += 1;
      continue;
    }
    break;
  }
  if (words[index] === SHELL_COMMAND_WRAPPER_COMMAND || words[index] === SHELL_SUDO_COMMAND) {
    return normalizeGitCommandSegment(words.slice(index + 1));
  }
  const shellCommandWords = shellCommandWrapperWords(words.slice(index));
  if (shellCommandWords !== null) {
    return shellSuccessProvingCommandSegments(shellCommandWords)
      .map((segment) => normalizeGitCommandSegment(segment))
      .find((segment): segment is readonly string[] => segment !== null) ?? null;
  }
  const command = stripShellRedirections(words.slice(index));
  return command[0] === AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE ? command : null;
}

function shellCommandWrapperWords(words: readonly string[]): readonly string[] | null {
  const executable = words[0];
  if (executable !== SHELL_BOURNE_COMMAND && executable !== SHELL_BASH_COMMAND) {
    return null;
  }
  const commandIndex = words.findIndex((word) =>
    word === SHELL_COMMAND_STRING_FLAG || word === SHELL_LOGIN_COMMAND_STRING_FLAG
  );
  const command = commandIndex === -1 ? undefined : words.at(commandIndex + 1);
  return command === undefined ? null : shellWords(command);
}

function isShellUnsafeSuccessSeparator(word: string): boolean {
  return word === SHELL_OPERATOR_OR
    || word === SHELL_OPERATOR_AMPERSAND
    || word === SHELL_OPERATOR_PIPE
    || word === SHELL_COMMAND_SEPARATOR.SEQUENCE;
}

function stripShellRedirections(words: readonly string[]): readonly string[] {
  const command: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (SHELL_DUPLICATED_DESCRIPTOR_PATTERN.test(word)) {
      continue;
    }
    if (SHELL_REDIRECTION_PATTERN.test(word)) {
      index += 1;
      continue;
    }
    command.push(word);
  }
  return command;
}

function parseGitBranchArgs(
  args: readonly string[],
  createFlags: readonly string[],
  allowedOptions: GitAllowedOptions,
): ParsedGitBranchArgs {
  const positionals: string[] = [];
  let createdBranch: string | null = null;
  let usesTrack = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (tupleIncludes(DISALLOWED_BRANCH_ASSOCIATION_FLAGS, arg)) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    const createBranch = gitCreateBranchParse(args, index, createFlags);
    if (createBranch === GIT_OPTION_CONSUMPTION.INVALID) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    if (createBranch !== null) {
      createdBranch = createBranch.branch;
      index += createBranch.consumed;
      continue;
    }
    const optionConsumption = gitOptionConsumption(args, index, allowedOptions);
    if (optionConsumption === GIT_OPTION_CONSUMPTION.INVALID) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    if (optionConsumption !== GIT_OPTION_CONSUMPTION.NOT_ALLOWED) {
      usesTrack ||= isTrackOption(arg);
      index += optionConsumption;
      continue;
    }
    if (arg.startsWith("-")) {
      return { createdBranch, positionals, usesTrack, invalid: true };
    }
    positionals.push(arg);
  }
  return { createdBranch, positionals, usesTrack, invalid: false };
}

function positionalBranchMatches(positional: string, parsed: ParsedGitBranchArgs, branch: string): boolean {
  return positional === branch || parsed.usesTrack && remoteTrackingBranchLocalName(positional) === branch;
}

function remoteTrackingBranchLocalName(ref: string): string | null {
  const firstSlash = ref.indexOf("/");
  return firstSlash > 0 && firstSlash < ref.length - 1 ? ref.slice(firstSlash + 1) : null;
}

function gitCreateBranchParse(
  args: readonly string[],
  index: number,
  createFlags: readonly string[],
): GitCreateBranchParse | typeof GIT_OPTION_CONSUMPTION.INVALID | null {
  if (!tupleIncludes(createFlags, args[index])) {
    return null;
  }
  const branch = args.at(index + 1);
  if (branch === undefined || branch.startsWith("-")) {
    return GIT_OPTION_CONSUMPTION.INVALID;
  }
  return {
    branch,
    consumed: 1,
  };
}

function gitOptionConsumption(
  args: readonly string[],
  index: number,
  allowedOptions: GitAllowedOptions,
): GitOptionConsumption {
  const arg = args[index];
  if (isInlineValueFlag(allowedOptions.valueFlags, arg)) {
    return 0;
  }
  if (tupleIncludes(allowedOptions.valueFlags, arg)) {
    const value = args.at(index + 1);
    if (value === undefined || value.startsWith("-")) {
      return GIT_OPTION_CONSUMPTION.INVALID;
    }
    return 1;
  }
  if (isInlineValueFlag(allowedOptions.optionalValueFlags, arg) || tupleIncludes(allowedOptions.flags, arg)) {
    return 0;
  }
  if (tupleIncludes(allowedOptions.optionalValueFlags, arg)) {
    return 0;
  }
  return GIT_OPTION_CONSUMPTION.NOT_ALLOWED;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string" && item.length > 0)
    ? value
    : null;
}

function tupleIncludes(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function isInlineValueFlag(flags: readonly string[], value: string): boolean {
  return flags.some((flag) => value.startsWith(`${flag}=`) && value.length > flag.length + 1);
}

function isTrackOption(value: string): boolean {
  return value === AGENT_TRANSCRIPT_GIT_COMMAND.TRACK
    || value === AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT
    || value.startsWith(`${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK}=`);
}

const SHELL_WORD_PATTERN = /"([^"]*)"|'([^']*)'|(\d*(?:>>?|<<<?|>&|<&|&>|&>>)&?\d*)|(&&|\|\||[;&|])|([^\s;&|<>]+)/gu;

function shellWords(command: string): readonly string[] {
  return [...command.matchAll(SHELL_WORD_PATTERN)].map((match) =>
    match.at(1) ?? match.at(2) ?? match.at(3) ?? match.at(4) ?? match[0]
  );
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

function coreMatchesSearchScope(
  core: AgentSessionHead,
  productScopeRoot: string,
  branchAssociatedWorktreeRoots: readonly string[],
): boolean {
  return isPathInsideOrEqual(productScopeRoot, core.cwd)
    || branchAssociatedWorktreeRoots.some((root) => isPathInsideOrEqual(root, core.cwd));
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

function compareSearchResults(left: AgentSearchResult, right: AgentSearchResult): number {
  const modifiedDiff = right.modifiedAtMs - left.modifiedAtMs;
  if (modifiedDiff !== 0) return modifiedDiff;
  return `${left.agent}:${left.sessionId}`.localeCompare(`${right.agent}:${right.sessionId}`);
}
