import { join, sep } from "node:path";

import { expect } from "vitest";

import {
  jsonAgentSearchSessions,
  resolveAgentSearchBranchAssociatedWorktreeRoots,
  resolveAgentSearchProductScopeRoot,
} from "@/commands/agent/search";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_KIND,
  AGENT_SESSION_ROW_TYPE,
  AGENT_TRANSCRIPT_CODEX_OUTPUT,
  AGENT_TRANSCRIPT_CONTENT_TYPE,
  AGENT_TRANSCRIPT_GIT_COMMAND,
  AGENT_TRANSCRIPT_PAYLOAD_TYPE,
  AGENT_TRANSCRIPT_TOOL_NAME,
} from "@/domains/agent/protocol";
import {
  type AgentSearchQuery,
  agentSearchQueryFromOptions,
  type AgentSearchQueryOptions,
  pickupIdSearchLiteral,
  searchAgentSessions,
  transcriptHasAcceptedBranchCommand,
} from "@/domains/agent/search";
import { resolveProductDir } from "@/domains/config/root";
import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
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
} from "@/git/root";
import { AGENT_CLI, createAgentDomain } from "@/interfaces/cli/agent";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
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

interface MappingCase {
  readonly name: string;
  readonly options: AgentSearchQueryOptions;
  readonly assertQuery: (query: AgentSearchQuery) => void;
}

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
  BRANCH_METADATA_HOME_DIR: 155,
  BRANCH_METADATA_PRODUCT_SCOPE_ROOT: 156,
  BRANCH_METADATA_CWD: 157,
  BRANCH_METADATA_NOW_MS: 158,
  BRANCH_METADATA_TARGET_BRANCH: 159,
  BRANCH_METADATA_OTHER_BRANCH: 160,
  BRANCH_METADATA_SESSION_ID: 161,
  BRANCH_METADATA_FOREIGN_ROOT: 170,
  BRANCH_METADATA_FOREIGN_CWD: 171,
  BRANCH_METADATA_FOREIGN_SESSION_ID: 172,
  BRANCH_METADATA_SUBAGENT_CWD: 190,
  BRANCH_METADATA_SUBAGENT_TRANSCRIPT_ID: 191,
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

const AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE = {
  START_POINT: "origin/main",
  WORKTREE_ADD_PATH: "../branch-worktree",
  SHELL_CD_PATH: "../repo",
  GIT_CONFIG_ASSIGNMENT: "protocol.version=2",
  SHELL_ENV_ASSIGNMENT: "SPX_BRANCH_SEARCH=1",
  SHELL_AMPERSAND: "&",
  SHELL_SEQUENCE: ";",
  SHELL_PIPE: "|",
  SHELL_OR: "||",
  SHELL_COMMAND_WRAPPER: "command",
  SHELL_SUDO_WRAPPER: "sudo",
  SHELL_BOURNE_WRAPPER: "sh",
  SHELL_BASH_WRAPPER: "bash",
  SHELL_COMMAND_STRING_FLAG: "-c",
  SHELL_LOGIN_COMMAND_STRING_FLAG: "-lc",
  SHELL_DONE_MARKER: "done",
  SHELL_TEE_COMMAND: "tee",
  SHELL_TEE_PATH: "branch-search.log",
  SHELL_REDIRECT_PATH: "/dev/null",
  CODEX_CALL_ID: "call_agent_search_branch_command",
  CLAUDE_TOOL_USE_ID: "toolu_agent_search_branch_command",
  UNSUPPORTED_TRACK_MODE_FLAG: "--track=bogus",
  LOCK_REASON: "agent-search-branch-lock",
  SUBMODULE_CHECKOUT_MODE: "on-demand",
  CONFLICT_STYLE: "zdiff3",
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

export async function assertAgentSearchProductScopeUsesLinkedWorktreeRoot(): Promise<void> {
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

  await expect(
    resolveAgentSearchProductScopeRoot(linkedWorktreeRoot, fallbackProductScopeRoot, git),
  ).resolves.toBe(linkedWorktreeRoot);
}

export async function assertAgentSearchFindsPickupMarkerInProductScopedTopLevelSessions(): Promise<void> {
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

  expect(results).toHaveLength(2);
  expect(results.map((result) => result.sessionId)).toEqual([codexSessionId, claudeSessionId]);
  expect(results.map((result) => result.agent)).toEqual([
    AGENT_SESSION_KIND.CODEX,
    AGENT_SESSION_KIND.CLAUDE_CODE,
  ]);
  expect(results.map((result) => result.matches)).toEqual([
    [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
    [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
  ]);
  expect(results.map((result) => result.cwd)).toEqual([codexCwd, claudeCwd]);
  expect(results.map((result) => result.sessionId)).not.toContain(foreignSessionId);
  expect(results.map((result) => result.sessionId)).not.toContain(subagentSessionId);
}

export async function assertAgentSearchJsonRecordsExposeMetadataAndMatchReasons(): Promise<void> {
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

  const parsed = JSON.parse(stdout.join("")) as readonly Record<string, unknown>[];

  expect(parsed).toHaveLength(1);
  const [record] = parsed;
  expect(record.agent).toBe(AGENT_SESSION_KIND.CODEX);
  expect(record.sessionId).toBe(sessionId);
  expect(record.cwd).toBe(cwd);
  expect(record.sourcePath).toBe(sourcePath);
  expect(record.modifiedAtMs).toBe(nowMs);
  expect(record.updatedAt).toBe(timestamp);
  expect(record.branch).toBeNull();
  expect(record.matches).toEqual([AGENT_SEARCH_MATCH_REASON.PICKUP_ID]);
}

export async function assertAgentSearchKeepsFallbackScopeOutsideGit(): Promise<void> {
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

  expect(stderr.join("")).toContain(warning);
  expect(stdout.join("")).toContain(sessionId);
  expect(stdout.join("")).not.toContain(foreignSessionId);
}

export async function assertAgentSearchSanitizesInvalidLimitValues(): Promise<void> {
  const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.LIMIT_CWD);
  const unsafeLimit = sampleAgentResumeValue(arbitraryUnsafeAgentSearchLimit(), SEARCH_SAMPLE.UNSAFE_LIMIT);
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [createAgentDomain()],
    processCwd: () => cwd,
    writeStderr: (output) => stderr.push(output),
  });
  program.exitOverride();

  await expect(
    program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.limit,
      unsafeLimit,
    ], { from: SPX_COMMANDER_PARSE_SOURCE }),
  ).rejects.toThrow();

  expect(stderr.join("")).toContain(sanitizeCliArgument(unsafeLimit));
  expect(stderr.join("")).not.toContain(unsafeLimit);
}

export async function assertAgentSearchRejectsPartiallyNumericLimitValues(): Promise<void> {
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

  await expect(
    program.parseAsync([
      AGENT_CLI.commandName,
      AGENT_CLI.searchCommandName,
      AGENT_CLI.flags.limit,
      partialNumericLimit,
    ], { from: SPX_COMMANDER_PARSE_SOURCE }),
  ).rejects.toThrow();

  expect(stderr.join("")).toContain(sanitizeCliArgument(partialNumericLimit));
}

export async function assertAgentSearchFindsSessionByBranchAssociatedWorktreeRoot(): Promise<void> {
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

  expect(results.map((result) => [result.sessionId, result.matches])).toEqual([
    [associatedSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
    [claudeAssociatedSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
}

export async function assertAgentSearchFindsSessionByAcceptedBranchCommandEvidence(): Promise<void> {
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
    marker: codexExecCommandRows(
      `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${targetBranch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
    ),
    modifiedAtMs: nowMs,
  });
  writeClaudeProjectTranscriptFile(fs, homeDir, {
    sessionId: claudeSessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    marker: claudeBashCommandRows(
      `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${targetBranch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
    ),
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

  expect(results.map((result) => [result.sessionId, result.matches])).toEqual([
    [codexSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
    [claudeSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
}

export async function assertAgentSearchReturnsNoBranchRootsWhenGitWorktreeListThrows(): Promise<void> {
  const cwd = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), SEARCH_SAMPLE.BRANCH_PRODUCT_SCOPE_ROOT);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_TARGET_BRANCH);
  const git: GitDependencies = {
    execa: async () => {
      throw new Error("git unavailable");
    },
  };

  await expect(resolveAgentSearchBranchAssociatedWorktreeRoots(cwd, branch, git)).resolves.toEqual([]);
}

export function agentSearchMappingCases(): readonly MappingCase[] {
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral());
  const contains = sampleAgentResumeValue(arbitraryDomainLiteral(), SEARCH_SAMPLE.MAPPING_CONTAINS);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.MAPPING_SESSION_ID);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.MAPPING_BRANCH);
  const explicitLimit = AGENT_SEARCH_DEFAULT_LIMIT + 1;
  return [
    {
      name: "pickup id maps to exact pickup-marker content search",
      options: { pickupId },
      assertQuery: (query) =>
        expect(query.contentNeedles).toEqual([
          {
            reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
            value: formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, pickupId),
          },
        ]),
    },
    {
      name: "literal content maps to transcript content search",
      options: { contains },
      assertQuery: (query) =>
        expect(query.contentNeedles).toEqual([
          { reason: AGENT_SEARCH_MATCH_REASON.CONTAINS, value: contains },
        ]),
    },
    {
      name: "agent session id maps to session metadata",
      options: { sessionId },
      assertQuery: (query) => expect(query.sessionId).toBe(sessionId),
    },
    {
      name: "branch maps to branch association",
      options: { branch },
      assertQuery: (query) => expect(query.branch).toBe(branch),
    },
    {
      name: "agent kind maps to the selected adapter set",
      options: { agent: AGENT_SESSION_KIND.CLAUDE_CODE },
      assertQuery: (query) => expect(query.agent).toBe(AGENT_SESSION_KIND.CLAUDE_CODE),
    },
    {
      name: "limit maps to maximum result count",
      options: { limit: explicitLimit },
      assertQuery: (query) => expect(query.limit).toBe(explicitLimit),
    },
    {
      name: "all maps to removing the recent-session bound",
      options: { all: true },
      assertQuery: (query) => expect(query.includeAll).toBe(true),
    },
  ];
}

export function assertAgentSearchOptionMapping(
  options: AgentSearchQueryOptions,
  assertQuery: MappingCase["assertQuery"],
): void {
  assertQuery(agentSearchQueryFromOptions(options));
}

export function assertAgentSearchOptionMappings(): void {
  for (const { options, assertQuery } of agentSearchMappingCases()) {
    assertAgentSearchOptionMapping(options, assertQuery);
  }
}

export function assertAgentSearchBranchCommandEvidenceMappings(): void {
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.MAPPING_BRANCH);
  const impliedWorktreeBranch = branch.split("/").at(-1) ?? branch;
  const shellAnd =
    `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_AMPERSAND}${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_AMPERSAND}`;
  const commandCases: Array<{
    readonly command: string;
    readonly expected: boolean;
    readonly branch?: string;
  }> = [
    {
      command: `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFIG} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_CONFIG_ASSIGNMENT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `env ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_ENV_ASSIGNMENT} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_ENV_ASSIGNMENT} env ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `cd ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH}${shellAnd}${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_PIPE}${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_TEE_COMMAND} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_TEE_PATH}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch} > ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_REDIRECT_PATH}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_AMPERSAND} echo ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_DONE_MARKER}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_OR} echo ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_DONE_MARKER}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_SEQUENCE} echo ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_DONE_MARKER}`,
      expected: false,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BOURNE_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_COMMAND_STRING_FLAG} '${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}'`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BASH_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_LOGIN_COMMAND_STRING_FLAG} '${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}'`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_COMMAND_WRAPPER} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_SUDO_WRAPPER} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.NO_TRACK} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.NO_TRACK} origin/${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK} origin/${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_INHERIT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.UNSUPPORTED_TRACK_MODE_FLAG} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.REASON} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.LOCK_REASON} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.MERGE} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SUBMODULE_CHECKOUT_MODE} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CONFLICT_STYLE} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command: `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.PATHSPEC_SEPARATOR} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: false,
    },
    {
      command: `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} -p ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.UNSUPPORTED_TRACK_MODE_FLAG} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.MERGE_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CONFLICT_STYLE} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch} ${shellAnd} echo ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_DONE_MARKER}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.FORCE_SHORT} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_SHORT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK_DIRECT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.LOCK} ${AGENT_TRANSCRIPT_GIT_COMMAND.REASON} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.LOCK_REASON} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.LOCK} ${AGENT_TRANSCRIPT_GIT_COMMAND.REASON} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ../${impliedWorktreeBranch}`,
      expected: true,
      branch: impliedWorktreeBranch,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.DETACH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.DETACH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.DETACH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.DETACH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch}`,
      expected: false,
    },
    { command: `echo ${branch}`, expected: false },
    {
      command: `echo ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
  ];

  for (const testCase of commandCases) {
    expect(transcriptHasAcceptedBranchCommand(
      codexExecCommandRows(testCase.command),
      testCase.branch ?? branch,
    )).toBe(testCase.expected);
  }

  for (
    const failedRows of [
      failedCodexExecCommandRows(
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      ),
      failedClaudeBashCommandRows(
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      ),
    ]
  ) {
    expect(transcriptHasAcceptedBranchCommand(failedRows, branch)).toBe(false);
  }
}

export function assertAgentSearchDefaultsToRecentBoundedAllAgentSearch(): void {
  const query = agentSearchQueryFromOptions({});

  expect(query.contentNeedles).toEqual([]);
  expect(query.sessionId).toBeNull();
  expect(query.branch).toBeNull();
  expect(query.agent).toBeNull();
  expect(query.includeAll).toBe(false);
  expect(query.limit).toBe(AGENT_SEARCH_DEFAULT_LIMIT);
}

export async function assertAgentSearchMatchesAllScopedRecentSessionsWithoutSelector(): Promise<void> {
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

  expect(results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
    [AGENT_SESSION_KIND.CODEX, codexSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
    [AGENT_SESSION_KIND.CLAUDE_CODE, claudeSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
  ]);
}

export async function assertAgentSearchMatchesOnlySelectedAgentKind(): Promise<void> {
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

  expect(results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
    [AGENT_SESSION_KIND.CODEX, codexSessionId, [AGENT_SEARCH_MATCH_REASON.AGENT]],
  ]);
}

export async function assertAgentSearchRequiresEverySelectorOnSameSession(): Promise<void> {
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

  expect(agentAndContent.map((result) => [result.sessionId, result.matches])).toEqual([
    [codexWithLiteral, [AGENT_SEARCH_MATCH_REASON.AGENT, AGENT_SEARCH_MATCH_REASON.CONTAINS]],
  ]);
  expect(sessionAndBranch.map((result) => [result.sessionId, result.matches])).toEqual([
    [sessionRightBranch, [AGENT_SEARCH_MATCH_REASON.SESSION_ID, AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
}

export async function assertAgentSearchBoundsDefaultOutputByLimit(): Promise<void> {
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

  expect(results).toHaveLength(AGENT_SEARCH_DEFAULT_LIMIT);
  expect(results.map((result) => result.agent)).toEqual(
    Array.from({ length: AGENT_SEARCH_DEFAULT_LIMIT }, () => AGENT_SESSION_KIND.CODEX),
  );
  expect(results.map((result) => result.sessionId)).toEqual(matchingSessionIds.slice(0, AGENT_SEARCH_DEFAULT_LIMIT));
}

export async function assertAgentSearchExcludesStaleOutOfScopeSubagentAndHandoffFiles(): Promise<void> {
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

  expect(results.map((result) => result.sessionId)).toEqual([includedSessionId]);
}

export async function assertAgentSearchBranchExistenceAloneReturnsNoSessions(): Promise<void> {
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

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  expect(results).toEqual([]);
}

export async function assertAgentSearchIncludesTranscriptMetadataBranchAssociation(): Promise<void> {
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
  const subagentCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_METADATA_SUBAGENT_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_METADATA_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_METADATA_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_METADATA_SESSION_ID);
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

  expect(results.map((result) => [result.sessionId, result.matches])).toEqual([
    [sessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
    [foreignSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
  expect(results.map((result) => result.cwd)).toEqual([cwd, foreignCwd]);
  expect(wrongBranchResults).toEqual([]);
}

export async function assertAgentSearchIncludesWorktreeRootBranchAssociation(): Promise<void> {
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
  const subagentCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(productScopeRoot),
    SEARCH_SAMPLE.BRANCH_ROOT_SUBAGENT_CWD,
  );
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), SEARCH_SAMPLE.BRANCH_ROOT_NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const targetBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ROOT_TARGET_BRANCH);
  const otherBranch = sampleAgentResumeValue(arbitraryAgentBranch(), SEARCH_SAMPLE.BRANCH_ROOT_OTHER_BRANCH);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), SEARCH_SAMPLE.BRANCH_ROOT_SESSION_ID);
  const subagentTranscriptId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    SEARCH_SAMPLE.BRANCH_ROOT_SUBAGENT_TRANSCRIPT_ID,
  );

  writeCodexTranscriptFile(fs, homeDir, {
    sessionId,
    cwd,
    timestamp,
    branch: otherBranch,
    modifiedAtMs: nowMs,
  });
  writeCodexSubagentTranscriptFile(fs, homeDir, {
    sessionId,
    transcriptId: subagentTranscriptId,
    cwd: subagentCwd,
    timestamp,
    branch: targetBranch,
    modifiedAtMs: nowMs - 1,
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

  expect(results.map((result) => [result.sessionId, result.matches])).toEqual([
    [sessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
  expect(results.map((result) => result.cwd)).toEqual([cwd]);
  expect(missingRootResults.map((result) => [result.sessionId, result.cwd, result.matches])).toEqual([
    [sessionId, subagentCwd, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
}

export async function assertAgentSearchExcludesSubagentsFromBranchAssociatedResults(): Promise<void> {
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
    marker: codexExecCommandRows(
      `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${targetBranch}`,
    ),
    modifiedAtMs: nowMs,
  });

  const results = await searchAgentSessions({
    agentHomeDirs: agentHomeDirsFromHomeDir(homeDir),
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  expect(results.map((result) => [result.sessionId, result.cwd, result.sourcePath, result.matches])).toEqual([
    [sessionId, evidenceCwd, parentSourcePath, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
  expect(results.map((result) => result.sessionId)).not.toContain(subagentTranscriptId);
}

export async function assertAgentSearchUsesOlderBranchEvidenceForRecentTopLevelSessions(): Promise<void> {
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
    marker: codexExecCommandRows(
      `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${targetBranch}`,
    ),
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
    marker: codexExecCommandRows(
      `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${targetBranch}`,
    ),
    modifiedAtMs: 0,
  });

  const results = await searchAgentSessions({
    homeDir,
    nowMs,
    productScopeRoot,
    fs,
    query: agentSearchQueryFromOptions({ branch: targetBranch }),
  });

  expect(results.map((result) => [
    result.sessionId,
    result.cwd,
    result.sourcePath,
    result.modifiedAtMs,
    result.branch,
    result.matches,
  ])).toEqual([
    [commandSessionId, cwd, expect.any(String), nowMs, otherBranch, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
    [
      parentSessionId,
      subagentCwd,
      parentSourcePath,
      nowMs - 1,
      otherBranch,
      [AGENT_SEARCH_MATCH_REASON.BRANCH],
    ],
    [outsideSessionId, cwd, expect.any(String), nowMs - 2, otherBranch, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
  ]);
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
