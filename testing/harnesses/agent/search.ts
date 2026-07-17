import { join, sep } from "node:path";

import {
  jsonAgentSearchSessions,
  resolveAgentSearchBranchAssociatedWorktreeRoots,
  resolveAgentSearchProductScopeRoot,
} from "@/commands/agent/search";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  AGENT_TRANSCRIPT_CODEX_OUTPUT,
  AGENT_TRANSCRIPT_CONTENT_TYPE,
  AGENT_TRANSCRIPT_PAYLOAD_TYPE,
  AGENT_TRANSCRIPT_TOOL_NAME,
} from "@/domains/agent/protocol";
import {
  type AgentSearchQuery,
  agentSearchQueryFromOptions,
  type AgentSearchResult,
  pickupIdSearchLiteral,
  searchAgentSessions,
  transcriptHasAcceptedBranchCommand,
} from "@/domains/agent/search";
import { resolveProductDir } from "@/domains/config/root";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  GIT_COMMON_DIR_ARGS,
  GIT_ROOT_COMMAND,
  GIT_SHOW_TOPLEVEL_ARGS,
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  GIT_WORKTREE_PORCELAIN_BARE_LINE,
  GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
  type GitDependencies,
} from "@/lib/git/root";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import {
  arbitraryAgentBranch,
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeRecentOffsetMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  arbitraryPartialNumericAgentSearchLimit,
  arbitraryUnsafeAgentSearchLimit,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE,
  type AgentSearchBranchCommandEvidenceCase,
  agentSearchBranchCommandEvidenceCases,
  agentSearchSwitchCommand,
  agentSearchSwitchCreateCommand,
  agentSearchWorktreeResetAddCommand,
} from "@testing/generators/agent/search";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

import {
  agentSessionJsonlName,
  codexTranscript,
  MemoryAgentSessionFileSystem,
  writeClaudeProjectTranscriptFile,
  writeClaudeSubagentTranscriptFile,
  writeCodexSubagentTranscriptFile,
  writeCodexTranscriptFile,
} from "./resume";

interface SearchFixture {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly productScopeRoot: string;
  readonly nowMs: number;
  readonly timestamp: string;
}

const SEARCH_SAMPLE = {
  LINKED_WORKTREE_ROOT: 60,
  COMMON_CHECKOUT_ROOT: 61,
  FALLBACK_PRODUCT_SCOPE_ROOT: 62,
  PRODUCT_SCOPE_ROOT: 1,
  FOREIGN_PRODUCT_ROOT: 2,
  CODEX_CWD: 3,
  CLAUDE_CWD: 4,
  FOREIGN_CWD: 5,
  PICKUP_ID: 6,
  CODEX_SESSION_ID: 7,
  CLAUDE_SESSION_ID: 8,
  FOREIGN_SESSION_ID: 9,
  SUBAGENT_SESSION_ID: 10,
  JSON_HOME_DIR: 20,
  JSON_PRODUCT_SCOPE_ROOT: 21,
  JSON_CWD: 22,
  JSON_NOW_MS: 23,
  JSON_PICKUP_ID: 24,
  JSON_SESSION_ID: 25,
  FALLBACK_HOME_DIR: 30,
  FALLBACK_SCOPE_ROOT: 31,
  FALLBACK_FOREIGN_ROOT: 32,
  FALLBACK_CWD: 33,
  FALLBACK_FOREIGN_CWD: 34,
  FALLBACK_NOW_MS: 35,
  FALLBACK_PICKUP_ID: 36,
  FALLBACK_SESSION_ID: 37,
  FALLBACK_FOREIGN_SESSION_ID: 38,
  LIMIT_CWD: 40,
  UNSAFE_LIMIT: 41,
  PARTIAL_LIMIT_CWD: 42,
  PARTIAL_LIMIT: 43,
  MAPPING_LIMIT_FIXTURE: 44,
  MAPPING_ALL_FIXTURE: 47,
  COMPLIANCE_HOME_DIR: 70,
  COMPLIANCE_PRODUCT_SCOPE_ROOT: 71,
  COMPLIANCE_FOREIGN_ROOT: 72,
  COMPLIANCE_CODEX_CWD: 73,
  COMPLIANCE_CLAUDE_CWD: 74,
  COMPLIANCE_FOREIGN_CWD: 75,
  COMPLIANCE_NOW_MS: 76,
  COMPLIANCE_RECENT_OFFSET_MS: 77,
  COMPLIANCE_CODEX_SESSION_ID: 78,
  COMPLIANCE_CLAUDE_SESSION_ID: 79,
  COMPLIANCE_STALE_SESSION_ID: 80,
  COMPLIANCE_FOREIGN_SESSION_ID: 81,
  AGENT_ONLY_HOME_DIR: 90,
  AGENT_ONLY_PRODUCT_SCOPE_ROOT: 91,
  AGENT_ONLY_CODEX_CWD: 92,
  AGENT_ONLY_CLAUDE_CWD: 93,
  AGENT_ONLY_NOW_MS: 94,
  AGENT_ONLY_CODEX_SESSION_ID: 95,
  AGENT_ONLY_CLAUDE_SESSION_ID: 96,
  SELECTOR_HOME_DIR: 100,
  SELECTOR_PRODUCT_SCOPE_ROOT: 101,
  SELECTOR_CWD: 102,
  SELECTOR_NOW_MS: 103,
  MATCHING_LITERAL: 104,
  OTHER_LITERAL: 105,
  TARGET_BRANCH: 106,
  OTHER_BRANCH: 107,
  CODEX_WITHOUT_LITERAL: 108,
  CODEX_WITH_LITERAL: 109,
  SESSION_WRONG_BRANCH: 110,
  SESSION_RIGHT_BRANCH: 111,
  EXCLUSION_HOME_DIR: 50,
  EXCLUSION_PRODUCT_SCOPE_ROOT: 51,
  EXCLUSION_FOREIGN_ROOT: 52,
  EXCLUSION_CWD: 53,
  EXCLUSION_FOREIGN_CWD: 54,
  EXCLUSION_NOW_MS: 55,
  EXCLUSION_RECENT_OFFSET_MS: 56,
  EXCLUSION_PICKUP_ID: 57,
  EXCLUSION_INCLUDED_SESSION_ID: 58,
  EXCLUSION_SUBAGENT_SESSION_ID: 59,
  EXCLUSION_STALE_SESSION_ID: 60,
  EXCLUSION_FOREIGN_SESSION_ID: 61,
  EXCLUSION_HANDOFF_SESSION_ID: 62,
  BRANCH_HOME_DIR: 120,
  BRANCH_PRODUCT_SCOPE_ROOT: 121,
  BRANCH_ASSOCIATED_ROOT: 122,
  BRANCH_ASSOCIATED_CWD: 123,
  BRANCH_UNASSOCIATED_ROOT: 124,
  BRANCH_UNASSOCIATED_CWD: 125,
  BRANCH_NOW_MS: 126,
  BRANCH_TARGET_BRANCH: 127,
  BRANCH_OTHER_BRANCH: 128,
  BRANCH_ASSOCIATED_SESSION_ID: 129,
  BRANCH_UNASSOCIATED_SESSION_ID: 130,
  BRANCH_CLAUDE_ASSOCIATED_SESSION_ID: 131,
  BRANCH_BARE_ROOT: 132,
  BRANCH_PRUNABLE_ROOT: 133,
  COMMAND_HOME_DIR: 134,
  COMMAND_PRODUCT_SCOPE_ROOT: 135,
  COMMAND_CWD: 136,
  COMMAND_NOW_MS: 137,
  COMMAND_TARGET_BRANCH: 138,
  COMMAND_OTHER_BRANCH: 139,
  COMMAND_CODEX_SESSION_ID: 140,
  COMMAND_CLAUDE_SESSION_ID: 141,
  BRANCH_ONLY_HOME_DIR: 142,
  BRANCH_ONLY_PRODUCT_SCOPE_ROOT: 143,
  BRANCH_ONLY_CWD: 144,
  BRANCH_ONLY_NOW_MS: 145,
  BRANCH_ONLY_TARGET_BRANCH: 146,
  BRANCH_ONLY_OTHER_BRANCH: 147,
  BRANCH_ONLY_SESSION_ID: 148,
  BRANCH_SUBAGENT_HOME_DIR: 149,
  BRANCH_SUBAGENT_PRODUCT_SCOPE_ROOT: 150,
  BRANCH_SUBAGENT_CWD: 151,
  BRANCH_SUBAGENT_EVIDENCE_CWD: 175,
  BRANCH_SUBAGENT_NOW_MS: 152,
  BRANCH_SUBAGENT_TARGET_BRANCH: 153,
  BRANCH_SUBAGENT_SESSION_ID: 154,
  BRANCH_SUBAGENT_TRANSCRIPT_ID: 173,
  BRANCH_SUBAGENT_OTHER_BRANCH: 174,
  BRANCH_SUBAGENT_COMMAND_CWD: 198,
  BRANCH_SUBAGENT_COMMAND_EVIDENCE_CWD: 199,
  BRANCH_SUBAGENT_COMMAND_SESSION_ID: 200,
  BRANCH_SUBAGENT_COMMAND_TRANSCRIPT_ID: 201,
  BRANCH_SUBAGENT_SCOPED_PARENT_CWD: 202,
  BRANCH_SUBAGENT_SCOPED_EVIDENCE_CWD: 203,
  BRANCH_SUBAGENT_SCOPED_SESSION_ID: 204,
  BRANCH_SUBAGENT_SCOPED_TRANSCRIPT_ID: 205,
  STALE_BRANCH_EVIDENCE_HOME_DIR: 176,
  STALE_BRANCH_EVIDENCE_PRODUCT_SCOPE_ROOT: 177,
  STALE_BRANCH_EVIDENCE_CWD: 178,
  STALE_BRANCH_EVIDENCE_SUBAGENT_CWD: 179,
  STALE_BRANCH_EVIDENCE_NOW_MS: 180,
  STALE_BRANCH_EVIDENCE_TARGET_BRANCH: 181,
  STALE_BRANCH_EVIDENCE_OTHER_BRANCH: 182,
  STALE_BRANCH_EVIDENCE_COMMAND_SESSION_ID: 183,
  STALE_BRANCH_EVIDENCE_COMMAND_TRANSCRIPT_ID: 184,
  STALE_BRANCH_EVIDENCE_PARENT_SESSION_ID: 185,
  STALE_BRANCH_EVIDENCE_SUBAGENT_TRANSCRIPT_ID: 186,
  STALE_BRANCH_EVIDENCE_OUTSIDE_SESSION_ID: 188,
  STALE_BRANCH_EVIDENCE_OUTSIDE_TRANSCRIPT_ID: 189,
  STALE_BRANCH_EVIDENCE_COMMAND_SUBAGENT_TRANSCRIPT_ID: 194,
  STALE_BRANCH_EVIDENCE_FUTURE_SESSION_ID: 195,
  STALE_BRANCH_EVIDENCE_FUTURE_TRANSCRIPT_ID: 196,
  STALE_BRANCH_EVIDENCE_OUTSIDE_SUBAGENT_TRANSCRIPT_ID: 197,
  BRANCH_METADATA_HOME_DIR: 155,
  BRANCH_METADATA_PRODUCT_SCOPE_ROOT: 156,
  BRANCH_METADATA_CWD: 157,
  BRANCH_METADATA_NOW_MS: 158,
  BRANCH_METADATA_TARGET_BRANCH: 159,
  BRANCH_METADATA_OTHER_BRANCH: 160,
  BRANCH_METADATA_SESSION_ID: 161,
  BRANCH_METADATA_CLAUDE_CWD: 173,
  BRANCH_METADATA_CLAUDE_SESSION_ID: 174,
  BRANCH_METADATA_FOREIGN_ROOT: 170,
  BRANCH_METADATA_FOREIGN_CWD: 171,
  BRANCH_METADATA_FOREIGN_SESSION_ID: 172,
  BRANCH_METADATA_SUBAGENT_CWD: 190,
  BRANCH_METADATA_SUBAGENT_TRANSCRIPT_ID: 191,
  BRANCH_METADATA_DUPLICATE_SESSION_ID: 206,
  BRANCH_METADATA_DUPLICATE_OLDER_TRANSCRIPT_ID: 207,
  BRANCH_METADATA_DUPLICATE_NEWER_TRANSCRIPT_ID: 208,
  CONTENT_DUPLICATE_SESSION_ID: 209,
  CONTENT_DUPLICATE_OLDER_TRANSCRIPT_ID: 210,
  CONTENT_DUPLICATE_NEWER_TRANSCRIPT_ID: 211,
  CONTENT_DUPLICATE_LITERAL: 212,
  BRANCH_ROOT_HOME_DIR: 162,
  BRANCH_ROOT_PRODUCT_SCOPE_ROOT: 163,
  BRANCH_ROOT_ASSOCIATED_ROOT: 164,
  BRANCH_ROOT_ASSOCIATED_CWD: 165,
  BRANCH_ROOT_NOW_MS: 166,
  BRANCH_ROOT_TARGET_BRANCH: 167,
  BRANCH_ROOT_OTHER_BRANCH: 168,
  BRANCH_ROOT_SESSION_ID: 169,
  BRANCH_ROOT_SUBAGENT_CWD: 192,
  BRANCH_ROOT_SUBAGENT_TRANSCRIPT_ID: 193,
  MAPPING_CONTAINS: 1,
  MAPPING_SESSION_ID: 2,
  MAPPING_BRANCH: 3,
} as const;

function searchFixture(sampleOffset: number = SEARCH_SAMPLE.PRODUCT_SCOPE_ROOT): SearchFixture {
  const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), sampleOffset);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), sampleOffset + 1);
  return {
    fs: new MemoryAgentSessionFileSystem(),
    homeDir: sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), sampleOffset + 2),
    productScopeRoot,
    nowMs,
    timestamp: new Date(nowMs).toISOString(),
  };
}

export async function withAgentSearchProductScopeEvidence(
  callback: (evidence: { readonly resolvedRoot: string; readonly linkedWorktreeRoot: string }) => void,
): Promise<void> {
  const linkedWorktreeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.LINKED_WORKTREE_ROOT,
  );
  const commonCheckoutRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.COMMON_CHECKOUT_ROOT,
  );
  const fallbackProductScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.FALLBACK_PRODUCT_SCOPE_ROOT,
  );
  const git: GitDependencies = {
    execa: async (_command, args) => {
      if (args.join(" ") === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) {
        return { exitCode: 0, stdout: linkedWorktreeRoot, stderr: "" };
      }
      if (args.join(" ") === GIT_COMMON_DIR_ARGS.join(" ")) {
        throw new Error("agent search product scope must not read git common dir");
      }
      return { exitCode: 0, stdout: commonCheckoutRoot, stderr: "" };
    },
  };

  callback({
    resolvedRoot: await resolveAgentSearchProductScopeRoot(linkedWorktreeRoot, fallbackProductScopeRoot, git),
    linkedWorktreeRoot,
  });
}

export async function withAgentSearchPickupMarkerEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly codexSessionId: string;
    readonly claudeSessionId: string;
    readonly foreignSessionId: string;
    readonly subagentSessionId: string;
    readonly codexCwd: string;
    readonly claudeCwd: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
  const productScopeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.PRODUCT_SCOPE_ROOT);
  const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.FOREIGN_PRODUCT_ROOT);
  const codexCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.CODEX_CWD);
  const claudeCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.CLAUDE_CWD);
  const foreignCwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(foreignProductRoot), SEARCH_SAMPLE.FOREIGN_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
  const timestamp = new Date(nowMs).toISOString();
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.PICKUP_ID);
  const pickupMarker = pickupIdSearchLiteral(pickupId);
  const codexSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CODEX_SESSION_ID);
  const claudeSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CLAUDE_SESSION_ID);
  const foreignSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.FOREIGN_SESSION_ID);
  const subagentSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.SUBAGENT_SESSION_ID);

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: codexSessionId,
    cwd: codexCwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs,
  });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd: claudeCwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: foreignSessionId,
    cwd: foreignCwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs,
  });
  writeClaudeSubagentTranscriptFile(fs, homeDir, {
    sessionId: subagentSessionId,
    cwd: claudeCwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ pickupId }),
  });

  callback({
    results,
    codexSessionId,
    claudeSessionId,
    foreignSessionId,
    subagentSessionId,
    codexCwd,
    claudeCwd,
  });
}

export async function withAgentSearchJsonMetadataEvidence(
  callback: (evidence: {
    readonly records: readonly Record<string, unknown>[];
    readonly sessionId: string;
    readonly cwd: string;
    readonly sourcePath: string;
    readonly modifiedAtMs: number;
    readonly updatedAt: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.JSON_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.JSON_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.JSON_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.JSON_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.JSON_PICKUP_ID);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.JSON_SESSION_ID);
  const sourcePath = writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    marker: pickupIdSearchLiteral(pickupId),
    modifiedAtMs: nowMs,
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [
      createAgentDomain({
        searchDeps: {
          fs,
          agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
          nowMs: () => nowMs,
          resolveProductScopeRoot: async () => productScopeRoot,
          resolveBranchAssociatedWorktreeRoots: async () => [],
        },
      }),
    ],
    processCwd: () => cwd,
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
  });

  await program.parseAsync([
    AGENT_CLI.commandName,
    AGENT_CLI.searchCommandName,
    AGENT_CLI.flags.pickupId,
    pickupId,
    AGENT_CLI.flags.json,
  ], { from: SPX_COMMANDER_PARSE_SOURCE });

  callback({
    records: JSON.parse(stdout.join("")) as readonly Record<string, unknown>[],
    sessionId,
    cwd,
    sourcePath,
    modifiedAtMs: nowMs,
    updatedAt: timestamp,
  });
}

export async function withAgentSearchFallbackScopeEvidence(
  callback: (evidence: {
    readonly stdout: string;
    readonly stderr: string;
    readonly warning: string;
    readonly sessionId: string;
    readonly foreignSessionId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.FALLBACK_HOME_DIR);
  const fallbackProductScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.FALLBACK_SCOPE_ROOT,
  );
  const foreignProductRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.FALLBACK_FOREIGN_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fallbackProductScopeRoot), SEARCH_SAMPLE.FALLBACK_CWD);
  const foreignCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignProductRoot),
    SEARCH_SAMPLE.FALLBACK_FOREIGN_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.FALLBACK_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.FALLBACK_PICKUP_ID);
  const pickupMarker = pickupIdSearchLiteral(pickupId);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.FALLBACK_SESSION_ID);
  const foreignSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.FALLBACK_FOREIGN_SESSION_ID,
  );
  const warning = resolveProductDir(fallbackProductScopeRoot).warning;
  if (warning === undefined) {
    throw new Error("agent search fallback scope fixture must be outside a git worktree");
  }

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: foreignSessionId,
    cwd: foreignCwd,
    timestamp,
    marker: pickupMarker,
    modifiedAtMs: nowMs,
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [
      createAgentDomain({
        searchDeps: {
          fs,
          agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
          nowMs: () => nowMs,
          resolveProductScopeRoot: async (_cwd, fallbackRoot) => fallbackRoot,
          resolveBranchAssociatedWorktreeRoots: async () => [],
        },
      }),
    ],
    processCwd: () => fallbackProductScopeRoot,
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
  });

  await program.parseAsync([
    AGENT_CLI.commandName,
    AGENT_CLI.searchCommandName,
    AGENT_CLI.flags.pickupId,
    pickupId,
  ], { from: SPX_COMMANDER_PARSE_SOURCE });

  callback({
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    warning,
    sessionId,
    foreignSessionId,
  });
}

export async function withAgentSearchUnsafeLimitEvidence(
  callback: (evidence: {
    readonly error: unknown;
    readonly stderr: string;
    readonly unsafeLimit: string;
    readonly sanitizedLimit: string;
  }) => void,
): Promise<void> {
  const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.LIMIT_CWD);
  const unsafeLimit = sampleAgentResumeValue(arbitraryUnsafeAgentSearchLimit(), SEARCH_SAMPLE.UNSAFE_LIMIT);
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [createAgentDomain()],
    processCwd: () => cwd,
    writeStderr: (output) => stderr.push(output),
  });
  program.exitOverride();

  let error: unknown = null;
  try {
    await program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.limit,
      unsafeLimit,
    ], { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (caught) {
    error = caught;
  }
  callback({
    error,
    stderr: stderr.join(""),
    unsafeLimit,
    sanitizedLimit: sanitizeCliArgument(unsafeLimit),
  });
}

export async function withAgentSearchPartialLimitEvidence(
  callback: (evidence: {
    readonly error: unknown;
    readonly stderr: string;
    readonly partialNumericLimit: string;
    readonly sanitizedLimit: string;
  }) => void,
): Promise<void> {
  const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.PARTIAL_LIMIT_CWD);
  const partialNumericLimit = sampleAgentResumeValue(
    arbitraryPartialNumericAgentSearchLimit(),
    SEARCH_SAMPLE.PARTIAL_LIMIT,
  );
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [createAgentDomain()],
    processCwd: () => cwd,
    writeStderr: (output) => stderr.push(output),
  });
  program.exitOverride();

  let error: unknown = null;
  try {
    await program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.limit,
      partialNumericLimit,
    ], { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (caught) {
    error = caught;
  }
  callback({
    error,
    stderr: stderr.join(""),
    partialNumericLimit,
    sanitizedLimit: sanitizeCliArgument(partialNumericLimit),
  });
}

export async function withAgentSearchBranchWorktreeEvidence(
  callback: (evidence: {
    readonly results: readonly { readonly sessionId: string; readonly matches: readonly string[] }[];
    readonly associatedSessionId: string;
    readonly claudeAssociatedSessionId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_PRODUCT_SCOPE_ROOT,
  );
  const branchAssociatedRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_ASSOCIATED_ROOT,
  );
  const associatedCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(branchAssociatedRoot),
    SEARCH_SAMPLE.BRANCH_ASSOCIATED_CWD,
  );
  const unassociatedRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_UNASSOCIATED_ROOT,
  );
  const bareRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_BARE_ROOT);
  const prunableRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_PRUNABLE_ROOT);
  const unassociatedCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(unassociatedRoot),
    SEARCH_SAMPLE.BRANCH_UNASSOCIATED_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_OTHER_BRANCH);
  const associatedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_ASSOCIATED_SESSION_ID,
  );
  const claudeAssociatedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_CLAUDE_ASSOCIATED_SESSION_ID,
  );
  const unassociatedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_UNASSOCIATED_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: associatedSessionId,
    cwd: associatedCwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeAssociatedSessionId,
    cwd: associatedCwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: unassociatedSessionId,
    cwd: unassociatedCwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 2,
  });
  const git: GitDependencies = {
    execa: async (command, args, options) => {
      if (command !== GIT_ROOT_COMMAND.EXECUTABLE || args.join(" ") !== GIT_WORKTREE_LIST_PORCELAIN_ARGS.join(" ")) {
        throw new Error("agent search branch-associated fixture only supports git worktree list");
      }
      if (options?.cwd !== productScopeRoot) {
        throw new Error("agent search branch-associated fixture must resolve roots from product scope");
      }
      return {
        exitCode: 0,
        stdout: [
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${productScopeRoot}`,
          `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${otherBranch}`,
          "",
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${bareRoot}`,
          GIT_WORKTREE_PORCELAIN_BARE_LINE,
          `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${targetBranch}`,
          "",
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${prunableRoot}`,
          GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE,
          `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${targetBranch}`,
          "",
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${branchAssociatedRoot}${sep}`,
          `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${targetBranch}`,
          "",
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${unassociatedRoot}`,
          `${GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX}${otherBranch}`,
        ].join("\n"),
        stderr: "",
      };
    },
  };

  const output = await jsonAgentSearchSessions({
    cwd: unassociatedRoot,
    fallbackProductScopeRoot: productScopeRoot,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
    deps: {
      fs,
      agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
      nowMs: () => nowMs,
      resolveProductScopeRoot: async () => productScopeRoot,
      resolveBranchAssociatedWorktreeRoots: async (cwd, branch) =>
        resolveAgentSearchBranchAssociatedWorktreeRoots(cwd, branch, git),
    },
  });
  const results = JSON.parse(output) as readonly { readonly sessionId: string; readonly matches: readonly string[] }[];

  callback({ results, associatedSessionId, claudeAssociatedSessionId });
}

export async function withAgentSearchBranchCommandEvidence(
  callback: (evidence: {
    readonly results: readonly { readonly sessionId: string; readonly matches: readonly string[] }[];
    readonly codexSessionId: string;
    readonly claudeSessionId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.COMMAND_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.COMMAND_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.COMMAND_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.COMMAND_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.COMMAND_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.COMMAND_OTHER_BRANCH);
  const codexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMMAND_CODEX_SESSION_ID,
  );
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMMAND_CLAUDE_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: codexSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    marker: codexExecCommandRows(agentSearchSwitchCreateCommand(targetBranch)),
    modifiedAtMs: nowMs,
  });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    marker: claudeBashCommandRows(agentSearchWorktreeResetAddCommand(targetBranch)),
    modifiedAtMs: nowMs - 1,
  });

  const output = await jsonAgentSearchSessions({
    cwd: productScopeRoot,
    fallbackProductScopeRoot: productScopeRoot,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
    deps: {
      fs,
      agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
      nowMs: () => nowMs,
      resolveProductScopeRoot: async () => productScopeRoot,
      resolveBranchAssociatedWorktreeRoots: async () => [],
    },
  });
  const results = JSON.parse(output) as readonly { readonly sessionId: string; readonly matches: readonly string[] }[];

  callback({ results, codexSessionId, claudeSessionId });
}

export async function withAgentSearchGitFailureEvidence(
  callback: (evidence: { readonly roots: readonly string[] }) => void,
): Promise<void> {
  const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_PRODUCT_SCOPE_ROOT);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_TARGET_BRANCH);
  const git: GitDependencies = {
    execa: async () => {
      throw new Error("git unavailable");
    },
  };

  callback({ roots: await resolveAgentSearchBranchAssociatedWorktreeRoots(cwd, branch, git) });
}

export function withAgentSearchOptionMappingEvidence(
  callback: (evidence: {
    readonly pickup: { readonly query: AgentSearchQuery; readonly pickupId: string };
    readonly contains: { readonly query: AgentSearchQuery; readonly literal: string };
    readonly session: { readonly query: AgentSearchQuery; readonly sessionId: string };
    readonly branch: { readonly query: AgentSearchQuery; readonly branch: string };
    readonly agent: AgentSearchQuery;
    readonly limit: { readonly query: AgentSearchQuery; readonly limit: number };
    readonly all: AgentSearchQuery;
  }) => void,
): void {
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral());
  const contains = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.MAPPING_CONTAINS);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.MAPPING_SESSION_ID);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.MAPPING_BRANCH);
  const explicitLimit = AGENT_SEARCH_DEFAULT_LIMIT + 1;
  callback({
    pickup: { query: agentSearchQueryFromOptions({ pickupId }), pickupId },
    contains: { query: agentSearchQueryFromOptions({ contains }), literal: contains },
    session: { query: agentSearchQueryFromOptions({ sessionId }), sessionId },
    branch: { query: agentSearchQueryFromOptions({ branch }), branch },
    agent: agentSearchQueryFromOptions({ agent: AGENT_SESSION_KIND.CLAUDE_CODE }),
    limit: { query: agentSearchQueryFromOptions({ limit: explicitLimit }), limit: explicitLimit },
    all: agentSearchQueryFromOptions({ all: true }),
  });
}

export function withAgentSearchBranchCommandMappingEvidence(
  callback: (evidence: {
    readonly declaredCases: readonly {
      readonly input: AgentSearchBranchCommandEvidenceCase;
      readonly accepted: boolean;
    }[];
    readonly failedAccepted: readonly boolean[];
    readonly incompleteAccepted: readonly boolean[];
  }) => void,
): void {
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.MAPPING_BRANCH);
  callback({
    declaredCases: agentSearchBranchCommandEvidenceCases(branch).map((input) => ({
      input,
      accepted: transcriptHasAcceptedBranchCommand(codexExecCommandRows(input.command), input.branch ?? branch),
    })),
    failedAccepted: [
      failedCodexExecCommandRows(agentSearchSwitchCommand(branch)),
      unknownCodexExecCommandRows(agentSearchSwitchCommand(branch)),
      failedClaudeBashCommandRows(agentSearchSwitchCommand(branch)),
      unknownClaudeBashCommandRows(agentSearchSwitchCommand(branch)),
    ].map((rows) => transcriptHasAcceptedBranchCommand(rows, branch)),
    incompleteAccepted: [
      codexExecFunctionCallRow(agentSearchSwitchCommand(branch)),
      claudeBashToolUseRow(agentSearchSwitchCommand(branch)),
    ].map((rows) => transcriptHasAcceptedBranchCommand(rows, branch)),
  });
}

export async function withAgentSearchExplicitLimitEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly matchingSessionIds: readonly string[];
    readonly explicitLimit: number;
  }) => void,
): Promise<void> {
  const fixture = searchFixture(SEARCH_SAMPLE.MAPPING_LIMIT_FIXTURE);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fixture.productScopeRoot), SEARCH_SAMPLE.LIMIT_CWD);
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.PICKUP_ID);
  const marker = pickupIdSearchLiteral(pickupId);
  const explicitLimit = AGENT_SEARCH_DEFAULT_LIMIT + 1;
  const sessionCount = explicitLimit + 1;
  const matchingSessionIds = Array.from(
    { length: sessionCount },
    (_value, index) => sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CODEX_SESSION_ID + index),
  );

  for (const [index, sessionId] of matchingSessionIds.entries()) {
    const modifiedAtMs = fixture.nowMs - index;
    writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
      sessionId,
      cwd,
      timestamp: new Date(modifiedAtMs).toISOString(),
      marker,
      modifiedAtMs,
    });
  }

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(fixture.homeDir),
    nowMs: fixture.nowMs,
    productScopeRoot: fixture.productScopeRoot,
    fs: fixture.fs,
    query: agentSearchQueryFromOptions({ pickupId, limit: explicitLimit }),
  });

  callback({ results, matchingSessionIds, explicitLimit });
}

export async function withAgentSearchAllSessionsEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly recentSessionId: string;
    readonly staleSessionId: string;
  }) => void,
): Promise<void> {
  const fixture = searchFixture(SEARCH_SAMPLE.MAPPING_ALL_FIXTURE);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fixture.productScopeRoot), SEARCH_SAMPLE.CODEX_CWD);
  const recentSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CODEX_SESSION_ID);
  const staleSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.COMPLIANCE_STALE_SESSION_ID);

  writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
    sessionId: recentSessionId,
    cwd,
    timestamp: fixture.timestamp,
    modifiedAtMs: fixture.nowMs,
  });
  writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
    sessionId: staleSessionId,
    cwd,
    timestamp: new Date(0).toISOString(),
    modifiedAtMs: 0,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(fixture.homeDir),
    nowMs: fixture.nowMs,
    productScopeRoot: fixture.productScopeRoot,
    fs: fixture.fs,
    query: agentSearchQueryFromOptions({ all: true }),
  });

  callback({ results, recentSessionId, staleSessionId });
}

export async function withAgentSearchOlderDuplicateEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly olderSourcePath: string;
  }) => void,
): Promise<void> {
  const fixture = searchFixture(SEARCH_SAMPLE.MAPPING_ALL_FIXTURE);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fixture.productScopeRoot), SEARCH_SAMPLE.CODEX_CWD);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CONTENT_DUPLICATE_SESSION_ID);
  const contains = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.CONTENT_DUPLICATE_LITERAL);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_TARGET_BRANCH);
  const olderSourcePath = writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
    sessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.CONTENT_DUPLICATE_OLDER_TRANSCRIPT_ID,
    ),
    cwd,
    timestamp: new Date(fixture.nowMs - 1).toISOString(),
    marker: contains,
    modifiedAtMs: fixture.nowMs - 1,
  });
  writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
    sessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.CONTENT_DUPLICATE_NEWER_TRANSCRIPT_ID,
    ),
    cwd,
    timestamp: fixture.timestamp,
    branch,
    modifiedAtMs: fixture.nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(fixture.homeDir),
    nowMs: fixture.nowMs,
    productScopeRoot: fixture.productScopeRoot,
    fs: fixture.fs,
    query: agentSearchQueryFromOptions({ branch, contains }),
  });

  callback({ results, sessionId, olderSourcePath });
}

export function withAgentSearchDefaultQueryEvidence(
  callback: (evidence: { readonly query: AgentSearchQuery }) => void,
): void {
  callback({ query: agentSearchQueryFromOptions({}) });
}

export async function withAgentSearchAllScopedSessionsEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly codexSessionId: string;
    readonly claudeSessionId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.COMPLIANCE_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.COMPLIANCE_PRODUCT_SCOPE_ROOT,
  );
  const foreignProductRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.COMPLIANCE_FOREIGN_ROOT,
  );
  const codexCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.COMPLIANCE_CODEX_CWD,
  );
  const claudeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.COMPLIANCE_CLAUDE_CWD,
  );
  const foreignCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignProductRoot),
    SEARCH_SAMPLE.COMPLIANCE_FOREIGN_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.COMPLIANCE_NOW_MS);
  const recentOffsetMs = sampleAgentResumeValue(
    arbitraryAgentResumeRecentOffsetMs(),
    SEARCH_SAMPLE.COMPLIANCE_RECENT_OFFSET_MS,
  );
  const timestamp = new Date(nowMs - recentOffsetMs).toISOString();
  const codexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMPLIANCE_CODEX_SESSION_ID,
  );
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMPLIANCE_CLAUDE_SESSION_ID,
  );
  const staleSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMPLIANCE_STALE_SESSION_ID,
  );
  const foreignSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.COMPLIANCE_FOREIGN_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, { sessionId: codexSessionId, cwd: codexCwd, timestamp, modifiedAtMs: nowMs });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd: claudeCwd,
    timestamp,
    modifiedAtMs: nowMs - recentOffsetMs,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: staleSessionId,
    cwd: codexCwd,
    timestamp: new Date(0).toISOString(),
    modifiedAtMs: 0,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: foreignSessionId,
    cwd: foreignCwd,
    timestamp,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({}),
  });

  callback({ results, codexSessionId, claudeSessionId });
}

export async function withAgentSearchSelectedKindEvidence(
  callback: (evidence: { readonly results: readonly AgentSearchResult[]; readonly codexSessionId: string }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.AGENT_ONLY_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.AGENT_ONLY_PRODUCT_SCOPE_ROOT,
  );
  const codexCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.AGENT_ONLY_CODEX_CWD,
  );
  const claudeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.AGENT_ONLY_CLAUDE_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.AGENT_ONLY_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const codexSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.AGENT_ONLY_CODEX_SESSION_ID,
  );
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.AGENT_ONLY_CLAUDE_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, { sessionId: codexSessionId, cwd: codexCwd, timestamp, modifiedAtMs: nowMs });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd: claudeCwd,
    timestamp,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ agent: AGENT_SESSION_KIND.CODEX }),
  });

  callback({ results, codexSessionId });
}

export async function withAgentSearchSelectorIntersectionEvidence(
  callback: (evidence: {
    readonly agentAndContent: readonly AgentSearchResult[];
    readonly sessionAndBranch: readonly AgentSearchResult[];
    readonly codexWithLiteral: string;
    readonly sessionRightBranch: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.SELECTOR_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.SELECTOR_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.SELECTOR_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.SELECTOR_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const matchingLiteral = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.MATCHING_LITERAL);
  const otherLiteral = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.OTHER_LITERAL);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.OTHER_BRANCH);
  const codexWithoutLiteral = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CODEX_WITHOUT_LITERAL);
  const codexWithLiteral = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.CODEX_WITH_LITERAL);
  const sessionWrongBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.SESSION_WRONG_BRANCH);
  const sessionRightBranch = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.SESSION_RIGHT_BRANCH);

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: codexWithoutLiteral,
    cwd,
    timestamp,
    marker: otherLiteral,
    modifiedAtMs: nowMs,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: codexWithLiteral,
    cwd,
    timestamp,
    marker: matchingLiteral,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: sessionWrongBranch,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 2,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: sessionRightBranch,
    cwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs - 3,
  });

  const agentAndContent = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ agent: AGENT_SESSION_KIND.CODEX, contains: matchingLiteral }),
  });
  const sessionAndBranch = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ sessionId: sessionRightBranch, branch: targetBranch }),
  });

  callback({ agentAndContent, sessionAndBranch, codexWithLiteral, sessionRightBranch });
}

export async function withAgentSearchDefaultLimitEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly matchingSessionIds: readonly string[];
  }) => void,
): Promise<void> {
  const fixture = searchFixture();
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(fixture.productScopeRoot), 2);
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), 4);
  const marker = pickupIdSearchLiteral(pickupId);
  const sessionCount = AGENT_SEARCH_DEFAULT_LIMIT + 1;
  const matchingSessionIds = Array.from(
    { length: sessionCount },
    (_value, index) => sampleAgentResumeValue(arbitraryAgentSessionId(), 10 + index),
  );

  for (const [index, sessionId] of matchingSessionIds.entries()) {
    const modifiedAtMs = fixture.nowMs - index;
    writeCodexTranscriptFile(fixture.fs, fixture.homeDir, {
      sessionId,
      cwd,
      timestamp: new Date(modifiedAtMs).toISOString(),
      marker,
      modifiedAtMs,
    });
  }

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(fixture.homeDir),
    nowMs: fixture.nowMs,
    productScopeRoot: fixture.productScopeRoot,
    fs: fixture.fs,
    query: agentSearchQueryFromOptions({ pickupId }),
  });

  callback({ results, matchingSessionIds });
}

export async function withAgentSearchExclusionEvidence(
  callback: (evidence: { readonly results: readonly AgentSearchResult[]; readonly includedSessionId: string }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.EXCLUSION_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.EXCLUSION_PRODUCT_SCOPE_ROOT,
  );
  const foreignProductRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.EXCLUSION_FOREIGN_ROOT);
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.EXCLUSION_CWD);
  const foreignCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignProductRoot),
    SEARCH_SAMPLE.EXCLUSION_FOREIGN_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.EXCLUSION_NOW_MS);
  const recentOffsetMs = sampleAgentResumeValue(
    arbitraryAgentResumeRecentOffsetMs(),
    SEARCH_SAMPLE.EXCLUSION_RECENT_OFFSET_MS,
  );
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.EXCLUSION_PICKUP_ID);
  const marker = pickupIdSearchLiteral(pickupId);
  const includedSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.EXCLUSION_INCLUDED_SESSION_ID,
  );
  const subagentSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.EXCLUSION_SUBAGENT_SESSION_ID,
  );
  const staleSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.EXCLUSION_STALE_SESSION_ID);
  const foreignSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.EXCLUSION_FOREIGN_SESSION_ID,
  );
  const handoffSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.EXCLUSION_HANDOFF_SESSION_ID,
  );
  const recentTimestamp = new Date(nowMs - recentOffsetMs).toISOString();

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: includedSessionId,
    cwd,
    timestamp: recentTimestamp,
    marker,
    modifiedAtMs: nowMs - recentOffsetMs,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId: subagentSessionId,
    cwd,
    timestamp: recentTimestamp,
    marker,
    modifiedAtMs: nowMs - recentOffsetMs,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: staleSessionId,
    cwd,
    timestamp: new Date(0).toISOString(),
    marker,
    modifiedAtMs: 0,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: foreignSessionId,
    cwd: foreignCwd,
    timestamp: recentTimestamp,
    marker,
    modifiedAtMs: nowMs - recentOffsetMs,
  });
  fs.writeFile(
    join(
      productScopeRoot,
      STATE_STORE_SCOPE_PATH.SPX_DIR,
      STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE,
      DEFAULT_CONFIG.sessions.statusDirs.doing,
      agentSessionJsonlName(handoffSessionId),
    ),
    `${codexTranscript({ sessionId: handoffSessionId, cwd, timestamp: recentTimestamp })}\n${marker}`,
    nowMs - recentOffsetMs,
  );

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ pickupId }),
  });

  callback({ results, includedSessionId });
}

export async function withAgentSearchBranchExistenceEvidence(
  callback: (evidence: {
    readonly observedBranches: readonly string[];
    readonly results: readonly unknown[];
    readonly targetBranch: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_ONLY_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_ONLY_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.BRANCH_ONLY_CWD);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_ONLY_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ONLY_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ONLY_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_ONLY_SESSION_ID);

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  const observedExistingBranches: string[] = [];
  const program = createCliProgram({
    domains: [
      createAgentDomain({
        searchDeps: {
          fs,
          agentHomeDirs: () => agentHomeDirsFromHomeDir(homeDir),
          nowMs: () => nowMs,
          resolveProductScopeRoot: async () => productScopeRoot,
          resolveBranchAssociatedWorktreeRoots: async (_cwd, branch) => {
            observedExistingBranches.push(branch);
            return [];
          },
        },
      }),
    ],
    processCwd: () => cwd,
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
  });

  await program.parseAsync([
    AGENT_CLI.commandName,
    AGENT_CLI.searchCommandName,
    AGENT_CLI.flags.branch,
    targetBranch,
    AGENT_CLI.flags.json,
  ], { from: SPX_COMMANDER_PARSE_SOURCE });

  callback({
    observedBranches: observedExistingBranches,
    results: JSON.parse(stdout.join("")) as readonly unknown[],
    targetBranch,
  });
}

export async function withAgentSearchMetadataBranchEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly wrongBranchResults: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly claudeSessionId: string;
    readonly foreignSessionId: string;
    readonly cwd: string;
    readonly claudeCwd: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_METADATA_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_METADATA_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_CWD,
  );
  const foreignRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_METADATA_FOREIGN_ROOT,
  );
  const foreignCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_FOREIGN_CWD,
  );
  const claudeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_CLAUDE_CWD,
  );
  const subagentCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_SUBAGENT_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_METADATA_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_METADATA_SESSION_ID);
  const claudeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_METADATA_CLAUDE_SESSION_ID,
  );
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_METADATA_SUBAGENT_TRANSCRIPT_ID,
  );
  const foreignSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_METADATA_FOREIGN_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs,
  });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd: claudeCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs - 3,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: subagentTranscriptId,
    cwd: subagentCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs - 2,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: foreignSessionId,
    cwd: foreignCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs - 1,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    branchAssociatedWorktreeRoots: [],
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });
  const wrongBranchResults = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    branchAssociatedWorktreeRoots: [],
    fs,
    query: agentSearchQueryFromOptions({ branch: otherBranch }),
  });

  callback({ results, wrongBranchResults, sessionId, claudeSessionId, foreignSessionId, cwd, claudeCwd });
}

export async function withAgentSearchStaleMetadataEvidence(
  callback: (evidence: { readonly results: readonly AgentSearchResult[] }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_METADATA_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_METADATA_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_CWD,
  );
  const foreignRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_METADATA_FOREIGN_ROOT,
  );
  const foreignCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_FOREIGN_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_METADATA_NOW_MS);
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_METADATA_DUPLICATE_SESSION_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.BRANCH_METADATA_DUPLICATE_OLDER_TRANSCRIPT_ID,
    ),
    cwd,
    timestamp: new Date(nowMs - 1).toISOString(),
    branch: targetBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.BRANCH_METADATA_DUPLICATE_NEWER_TRANSCRIPT_ID,
    ),
    cwd: foreignCwd,
    timestamp: new Date(nowMs).toISOString(),
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    branchAssociatedWorktreeRoots: [],
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({ results });
}

export async function withAgentSearchWorktreeRootEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly missingRootResults: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly cwd: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_ROOT_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_ROOT_PRODUCT_SCOPE_ROOT,
  );
  const branchAssociatedRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_ROOT_ASSOCIATED_ROOT,
  );
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(branchAssociatedRoot),
    SEARCH_SAMPLE.BRANCH_ROOT_ASSOCIATED_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_ROOT_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ROOT_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ROOT_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_ROOT_SESSION_ID);

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    branchAssociatedWorktreeRoots: [branchAssociatedRoot],
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });
  const missingRootResults = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    branchAssociatedWorktreeRoots: [],
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({ results, missingRootResults, sessionId, cwd });
}

export async function withAgentSearchSubagentMetadataEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly evidenceCwd: string;
    readonly parentSourcePath: string;
    readonly subagentTranscriptId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_SUBAGENT_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(productScopeRoot), SEARCH_SAMPLE.BRANCH_SUBAGENT_CWD);
  const evidenceCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_EVIDENCE_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_SUBAGENT_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_SUBAGENT_SESSION_ID);
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_TRANSCRIPT_ID,
  );

  const parentSourcePath = writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: subagentTranscriptId,
    cwd: evidenceCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({ results, sessionId, evidenceCwd, parentSourcePath, subagentTranscriptId });
}

export async function withAgentSearchSubagentCommandEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly evidenceCwd: string;
    readonly parentSourcePath: string;
    readonly subagentTranscriptId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_SUBAGENT_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_COMMAND_CWD,
  );
  const evidenceCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_COMMAND_EVIDENCE_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_SUBAGENT_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_COMMAND_SESSION_ID,
  );
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_COMMAND_TRANSCRIPT_ID,
  );

  const parentSourcePath = writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: subagentTranscriptId,
    cwd: evidenceCwd,
    timestamp,
    branch: otherBranch,
    marker: codexExecCommandRows(agentSearchSwitchCommand(targetBranch)),
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({ results, sessionId, evidenceCwd, parentSourcePath, subagentTranscriptId });
}

export async function withAgentSearchSubagentScopeEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly sessionId: string;
    readonly evidenceCwd: string;
    readonly parentSourcePath: string;
    readonly subagentTranscriptId: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_SUBAGENT_HOME_DIR);
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_PRODUCT_SCOPE_ROOT,
  );
  const foreignRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.FOREIGN_PRODUCT_ROOT);
  const parentCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(foreignRoot),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_SCOPED_PARENT_CWD,
  );
  const evidenceCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_SCOPED_EVIDENCE_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_SUBAGENT_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_SUBAGENT_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_SCOPED_SESSION_ID,
  );
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_SUBAGENT_SCOPED_TRANSCRIPT_ID,
  );

  const parentSourcePath = writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd: parentCwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: subagentTranscriptId,
    cwd: evidenceCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({ results, sessionId, evidenceCwd, parentSourcePath, subagentTranscriptId });
}

export async function withAgentSearchOlderBranchEvidence(
  callback: (evidence: {
    readonly results: readonly AgentSearchResult[];
    readonly commandSessionId: string;
    readonly parentSessionId: string;
    readonly outsideSessionId: string;
    readonly futureSessionId: string;
    readonly cwd: string;
    readonly subagentCwd: string;
    readonly parentSourcePath: string;
    readonly nowMs: number;
    readonly otherBranch: string;
  }) => void,
): Promise<void> {
  const fs = new MemoryAgentSessionFileSystem();
  const homeDir = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_HOME_DIR,
  );
  const productScopeRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_PRODUCT_SCOPE_ROOT,
  );
  const cwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_CWD,
  );
  const subagentCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_SUBAGENT_CWD,
  );
  const outsideCwd = join(homeDir, "outside-product");
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const staleTimestamp = new Date(0).toISOString();
  const targetBranch = sampleAgentResumeValue(
    arbitraryAgentBranch(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_TARGET_BRANCH,
  );
  const otherBranch = sampleAgentResumeValue(
    arbitraryAgentBranch(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_OTHER_BRANCH,
  );
  const commandSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_COMMAND_SESSION_ID,
  );
  const commandTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_COMMAND_TRANSCRIPT_ID,
  );
  const parentSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_PARENT_SESSION_ID,
  );
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_SUBAGENT_TRANSCRIPT_ID,
  );
  const outsideSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_OUTSIDE_SESSION_ID,
  );
  const outsideTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_OUTSIDE_TRANSCRIPT_ID,
  );
  const futureSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_FUTURE_SESSION_ID,
  );
  const futureTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_FUTURE_TRANSCRIPT_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: commandSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: commandSessionId,
    transcriptId: commandTranscriptId,
    cwd,
    timestamp: staleTimestamp,
    branch: otherBranch,
    marker: codexExecCommandRows(agentSearchSwitchCommand(targetBranch)),
    modifiedAtMs: 0,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId: commandSessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_COMMAND_SUBAGENT_TRANSCRIPT_ID,
    ),
    cwd: subagentCwd,
    timestamp: staleTimestamp,
    branch: targetBranch,
    modifiedAtMs: 0,
  });
  const parentSourcePath = writeCodexTranscriptFile(fs, homeDir, {
    sessionId: parentSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 1,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId: parentSessionId,
    transcriptId: subagentTranscriptId,
    cwd: subagentCwd,
    timestamp: staleTimestamp,
    branch: targetBranch,
    modifiedAtMs: 0,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: outsideSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 2,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: outsideSessionId,
    transcriptId: outsideTranscriptId,
    cwd: outsideCwd,
    timestamp: staleTimestamp,
    branch: otherBranch,
    marker: codexExecCommandRows(agentSearchSwitchCommand(targetBranch)),
    modifiedAtMs: 0,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId: outsideSessionId,
    transcriptId: sampleAgentResumeValue(
      arbitraryAgentSessionId(),
      SEARCH_SAMPLE.STALE_BRANCH_EVIDENCE_OUTSIDE_SUBAGENT_TRANSCRIPT_ID,
    ),
    cwd: outsideCwd,
    timestamp: staleTimestamp,
    branch: targetBranch,
    modifiedAtMs: 0,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: futureSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs - 3,
  });
  writeCodexTranscriptFile(fs, homeDir, {
    sessionId: futureSessionId,
    transcriptId: futureTranscriptId,
    cwd,
    timestamp,
    branch: otherBranch,
    marker: codexExecCommandRows(agentSearchSwitchCommand(targetBranch)),
    modifiedAtMs: nowMs + 1,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  callback({
    results,
    commandSessionId,
    parentSessionId,
    outsideSessionId,
    futureSessionId,
    cwd,
    subagentCwd,
    parentSourcePath,
    nowMs,
    otherBranch,
  });
}

function codexExecCommandRows(command: string): string {
  return [
    codexExecFunctionCallRow(command),
    codexExecFunctionCallOutputRow(0),
  ].join("\n");
}

function failedCodexExecCommandRows(command: string): string {
  return [
    codexExecFunctionCallRow(command),
    codexExecFunctionCallOutputRow(1),
  ].join("\n");
}

function unknownCodexExecCommandRows(command: string): string {
  return [
    codexExecFunctionCallRow(command),
    codexExecFunctionCallOutputWithoutExitCodeRow(),
  ].join("\n");
}

function codexExecFunctionCallRow(command: string): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_RESPONSE_ITEM,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL,
      [AGENT_SESSION_JSON_FIELDS.NAME]: AGENT_TRANSCRIPT_TOOL_NAME.CODEX_EXEC_COMMAND,
      [AGENT_SESSION_JSON_FIELDS.CALL_ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CODEX_CALL_ID,
      [AGENT_SESSION_JSON_FIELDS.ARGUMENTS]: JSON.stringify({
        [AGENT_SESSION_JSON_FIELDS.CMD]: command,
      }),
    },
  });
}

function codexExecFunctionCallOutputRow(exitCode: number): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_RESPONSE_ITEM,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL_OUTPUT,
      [AGENT_SESSION_JSON_FIELDS.CALL_ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CODEX_CALL_ID,
      [AGENT_SESSION_JSON_FIELDS.OUTPUT]: `${AGENT_TRANSCRIPT_CODEX_OUTPUT.PROCESS_EXITED_WITH_CODE} ${exitCode}`,
    },
  });
}

function codexExecFunctionCallOutputWithoutExitCodeRow(): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_RESPONSE_ITEM,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_PAYLOAD_TYPE.FUNCTION_CALL_OUTPUT,
      [AGENT_SESSION_JSON_FIELDS.CALL_ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CODEX_CALL_ID,
    },
  });
}

function claudeBashCommandRows(command: string): string {
  return [
    claudeBashToolUseRow(command),
    claudeBashToolResultRow(false),
  ].join("\n");
}

function failedClaudeBashCommandRows(command: string): string {
  return [
    claudeBashToolUseRow(command),
    claudeBashToolResultRow(true),
  ].join("\n");
}

function unknownClaudeBashCommandRows(command: string): string {
  return [
    claudeBashToolUseRow(command),
    claudeBashToolResultWithoutStatusRow(),
  ].join("\n");
}

function claudeBashToolUseRow(command: string): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CLAUDE_ASSISTANT,
    [AGENT_SESSION_JSON_FIELDS.MESSAGE]: {
      [AGENT_SESSION_JSON_FIELDS.CONTENT]: [
        {
          [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_USE,
          [AGENT_SESSION_JSON_FIELDS.ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CLAUDE_TOOL_USE_ID,
          [AGENT_SESSION_JSON_FIELDS.NAME]: AGENT_TRANSCRIPT_TOOL_NAME.CLAUDE_BASH,
          [AGENT_SESSION_JSON_FIELDS.INPUT]: {
            [AGENT_SESSION_JSON_FIELDS.COMMAND]: command,
          },
        },
      ],
    },
  });
}

function claudeBashToolResultRow(isError: boolean): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CLAUDE_USER,
    [AGENT_SESSION_JSON_FIELDS.MESSAGE]: {
      [AGENT_SESSION_JSON_FIELDS.CONTENT]: [
        {
          [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_RESULT,
          [AGENT_SESSION_JSON_FIELDS.TOOL_USE_ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CLAUDE_TOOL_USE_ID,
          [AGENT_SESSION_JSON_FIELDS.IS_ERROR]: isError,
        },
      ],
    },
  });
}

function claudeBashToolResultWithoutStatusRow(): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CLAUDE_USER,
    [AGENT_SESSION_JSON_FIELDS.MESSAGE]: {
      [AGENT_SESSION_JSON_FIELDS.CONTENT]: [
        {
          [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_TRANSCRIPT_CONTENT_TYPE.TOOL_RESULT,
          [AGENT_SESSION_JSON_FIELDS.TOOL_USE_ID]: AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CLAUDE_TOOL_USE_ID,
        },
      ],
    },
  });
}
