import { AGENT_RESUME_LIMITS, AGENT_SEARCH_MATCH_REASON, type AgentSearchMatchReason } from "../protocol";
import {
  type AgentSessionFileSystem,
  type AgentSessionHead,
  type AgentStoreFile,
  isPathInsideOrEqual,
  parseCodexHead,
} from "../resume";
import { transcriptHasAcceptedBranchCommand } from "./transcript-command-evidence";

export type AgentHeadParser = (head: string) => AgentSessionHead | null;

export interface AgentSearchReadableFileSystem extends AgentSessionFileSystem {
  readText(path: string): Promise<string>;
}

export interface BranchAssociationOptions {
  readonly productScopeRoot: string;
  readonly branchAssociatedWorktreeRoots?: readonly string[];
  readonly fs: AgentSearchReadableFileSystem;
  readonly query: {
    readonly branch: string | null;
  };
}

export interface CodexSubagentBranchAssociation {
  readonly cwd: string;
}

export interface BranchSearchMatch {
  readonly reasons: readonly AgentSearchMatchReason[];
  readonly effectiveCwd: string | null;
}

export interface TopLevelBranchAssociations {
  readonly commandAssociatedSessionIds: ReadonlySet<string>;
  readonly commandCheckedSessionIds: ReadonlySet<string>;
}

interface MutableTopLevelBranchAssociations {
  readonly commandAssociatedSessionIds: Set<string>;
  readonly commandCheckedSessionIds: Set<string>;
}

export async function collectTopLevelBranchAssociations(
  files: readonly AgentStoreFile[],
  options: BranchAssociationOptions,
  parseHead: AgentHeadParser,
): Promise<TopLevelBranchAssociations> {
  const branch = options.query.branch;
  const associated: MutableTopLevelBranchAssociations = {
    commandAssociatedSessionIds: new Set<string>(),
    commandCheckedSessionIds: new Set<string>(),
  };
  if (branch === null) {
    return associated;
  }
  for (const file of files) {
    const head = await options.fs.readHead(file.path, AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES).catch(() => null);
    if (head === null) {
      continue;
    }
    const core = parseHead(head);
    if (
      core === null
      || !core.interactive
      || core.subagent
      || !coreMatchesSearchScope(core, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? [])
    ) {
      continue;
    }
    const content = await options.fs.readText(file.path).catch(() => null);
    if (content === null) {
      continue;
    }
    associated.commandCheckedSessionIds.add(core.sessionId);
    if (transcriptHasAcceptedBranchCommand(content, branch)) {
      associated.commandAssociatedSessionIds.add(core.sessionId);
    }
  }
  return associated;
}

export async function collectCodexSubagentBranchAssociations(
  files: readonly AgentStoreFile[],
  options: BranchAssociationOptions,
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
    if (
      core === null
      || !core.subagent
      || !coreMatchesSearchScope(core, options.productScopeRoot, options.branchAssociatedWorktreeRoots ?? [])
    ) {
      continue;
    }
    if (core.branch === branch) {
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

export function branchMetadataOrWorktreeMatchReasons(
  core: AgentSessionHead,
  branch: string | null,
  topLevelBranchAssociations: TopLevelBranchAssociations,
  subagentBranchAssociations: ReadonlyMap<string, CodexSubagentBranchAssociation>,
  currentMetadataBranchAssociationCwd: string | null,
): BranchSearchMatch | null {
  if (branch === null) {
    return {
      reasons: [],
      effectiveCwd: null,
    };
  }
  if (currentMetadataBranchAssociationCwd !== null) {
    return branchSearchMatch(currentMetadataBranchAssociationCwd);
  }
  if (topLevelBranchAssociations.commandAssociatedSessionIds.has(core.sessionId)) {
    return branchSearchMatch(null);
  }
  const subagentBranchAssociation = subagentBranchAssociations.get(core.sessionId) ?? null;
  return subagentBranchAssociation === null ? null : branchSearchMatch(subagentBranchAssociation.cwd);
}

export function branchTranscriptCommandMatchReasons(
  content: string | undefined,
  branch: string | null,
): BranchSearchMatch | null {
  if (branch === null) {
    return {
      reasons: [],
      effectiveCwd: null,
    };
  }
  return content !== undefined && transcriptHasAcceptedBranchCommand(content, branch)
    ? branchSearchMatch(null)
    : null;
}

export function coreMatchesSearchScope(
  core: AgentSessionHead,
  productScopeRoot: string,
  branchAssociatedWorktreeRoots: readonly string[],
): boolean {
  return cwdMatchesSearchScope(core.cwd, productScopeRoot, branchAssociatedWorktreeRoots);
}

export function currentMetadataBranchAssociationCwd(
  core: AgentSessionHead,
  branch: string | null,
  branchAssociatedWorktreeRoots: readonly string[],
): string | null {
  if (branch === null) {
    return null;
  }
  if (core.branch === branch) {
    return core.cwd;
  }
  return branchAssociatedWorktreeRoots.some((root) => isPathInsideOrEqual(root, core.cwd)) ? core.cwd : null;
}

export function cwdMatchesSearchScope(
  cwd: string,
  productScopeRoot: string,
  branchAssociatedWorktreeRoots: readonly string[],
): boolean {
  return isPathInsideOrEqual(productScopeRoot, cwd)
    || branchAssociatedWorktreeRoots.some((root) => isPathInsideOrEqual(root, cwd));
}

function branchSearchMatch(
  effectiveCwd: string | null,
): BranchSearchMatch {
  return {
    reasons: [AGENT_SEARCH_MATCH_REASON.BRANCH],
    effectiveCwd,
  };
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
