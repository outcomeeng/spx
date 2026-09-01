import * as fc from "fast-check";

import {
  AGENT_RESUME_RECENT_WINDOW_MS,
  AGENT_SEARCH_RECENT_WINDOW_MS,
  AGENT_TRANSCRIPT_GIT_COMMAND,
} from "@/domains/agent/protocol";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import type { ClaudeTranscriptRecord, ClaudeTranscriptRecords } from "@testing/harnesses/agent/resume";

import {
  arbitraryAgentBranch,
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
} from "./resume";

const MIN_LEADING_RECORDS = 1;
const MAX_LEADING_RECORDS = 6;
const MIN_TRAILING_RECORDS = 0;
const MAX_TRAILING_RECORDS = 6;
const RECORD_INTERVAL_MS = 1_000;
const WINDOW_EDGE_MARGIN_MS = 1;
const SINCE_WINDOW_DIVISOR = 4;
const NEEDLE_JOINER = "-";

/**
 * A store holding one session inside a caller-supplied reach window and one outside it,
 * with both aged within the search default so only the window decides admission.
 */
export interface GeneratedSinceWindowScenario {
  readonly homeDir: string;
  readonly productScopeRoot: string;
  readonly insideSessionId: string;
  readonly outsideSessionId: string;
  readonly insideCwd: string;
  readonly outsideCwd: string;
  readonly branch: string;
  readonly sinceMs: number;
  readonly insideModifiedAtMs: number;
  readonly outsideModifiedAtMs: number;
  /**
   * Content timestamps inverted against the modification times, so evidence built on this
   * scenario passes only where the modification time decides eligibility.
   */
  readonly insideContentTimestampMs: number;
  readonly outsideContentTimestampMs: number;
  readonly nowMs: number;
}

export function arbitrarySinceWindowScenario(): fc.Arbitrary<GeneratedSinceWindowScenario> {
  return fc
    .tuple(
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentBranch(),
      arbitraryAgentResumeNowMs(),
      fc.integer({
        min: Math.floor(AGENT_SEARCH_RECENT_WINDOW_MS / SINCE_WINDOW_DIVISOR),
        max: AGENT_SEARCH_RECENT_WINDOW_MS - WINDOW_EDGE_MARGIN_MS,
      }),
    )
    .chain(([insideSessionId, outsideSessionId, homeDir, productScopeRoot, branch, nowMs, sinceMs]) =>
      fc
        .tuple(
          arbitraryAgentSessionCwd(productScopeRoot),
          arbitraryAgentSessionCwd(productScopeRoot),
          fc.integer({ min: 0, max: sinceMs - WINDOW_EDGE_MARGIN_MS }),
          fc.integer({
            min: sinceMs + WINDOW_EDGE_MARGIN_MS,
            max: AGENT_SEARCH_RECENT_WINDOW_MS,
          }),
        )
        .map(([insideCwd, outsideCwd, insideAgeMs, outsideAgeMs]) => ({
          homeDir,
          productScopeRoot,
          insideSessionId,
          outsideSessionId,
          insideCwd,
          outsideCwd,
          branch,
          sinceMs,
          insideModifiedAtMs: nowMs - insideAgeMs,
          outsideModifiedAtMs: nowMs - outsideAgeMs,
          insideContentTimestampMs: nowMs - outsideAgeMs,
          outsideContentTimestampMs: nowMs - insideAgeMs,
          nowMs,
        }))
    );
}

/**
 * A session older than the continuation window resume applies and newer than the
 * forensic window search applies, so each consumer's default decides it differently.
 */
export interface GeneratedBetweenReachWindowsScenario {
  readonly homeDir: string;
  readonly productScopeRoot: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly branch: string;
  readonly modifiedAtMs: number;
  readonly nowMs: number;
}

export function arbitraryBetweenReachWindowsScenario(): fc.Arbitrary<GeneratedBetweenReachWindowsScenario> {
  return fc
    .tuple(
      arbitraryAgentSessionId(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentBranch(),
      arbitraryAgentResumeNowMs(),
      fc.integer({
        min: AGENT_RESUME_RECENT_WINDOW_MS + WINDOW_EDGE_MARGIN_MS,
        max: AGENT_SEARCH_RECENT_WINDOW_MS - WINDOW_EDGE_MARGIN_MS,
      }),
    )
    .chain(([sessionId, homeDir, productScopeRoot, branch, nowMs, ageMs]) =>
      arbitraryAgentSessionCwd(productScopeRoot).map((cwd) => ({
        homeDir,
        productScopeRoot,
        sessionId,
        cwd,
        branch,
        modifiedAtMs: nowMs - ageMs,
        nowMs,
      }))
    );
}

/**
 * A session that opens in one product and later works in another, which is how a
 * transcript's recorded working directory and branch diverge from the values its
 * opening record carries.
 */
export interface GeneratedMovingSessionScenario {
  readonly homeDir: string;
  readonly sessionId: string;
  readonly productScopeRoot: string;
  readonly foreignRoot: string;
  readonly targetBranch: string;
  readonly otherBranch: string;
  readonly branchRecordIndex: number;
  readonly branchRecordCwd: string;
  readonly records: ClaudeTranscriptRecords;
  readonly contentNeedle: string;
  /** An in-scope session carrying neither the needle nor the requested branch. */
  readonly decoySessionId: string;
  readonly decoyRecords: ClaudeTranscriptRecords;
  /** A session recording neither the requested branch nor any working directory in the product. */
  readonly foreignOnlySessionId: string;
  readonly foreignOnlyRecords: ClaudeTranscriptRecords;
  /** A session recording the requested branch only where the working directory is foreign. */
  readonly outOfScopeBranchSessionId: string;
  readonly outOfScopeBranchRecords: ClaudeTranscriptRecords;
  readonly nowMs: number;
}

export function arbitraryMovingSessionBranchScenario(): fc.Arbitrary<GeneratedMovingSessionScenario> {
  return fc
    .tuple(
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentBranch(),
      arbitraryAgentBranch(),
      arbitraryAgentResumeNowMs(),
      fc.integer({ min: MIN_LEADING_RECORDS, max: MAX_LEADING_RECORDS }),
      fc.integer({ min: MIN_TRAILING_RECORDS, max: MAX_TRAILING_RECORDS }),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
    )
    .chain((
      [
        sessionId,
        decoySessionId,
        foreignOnlySessionId,
        outOfScopeBranchSessionId,
        homeDir,
        productScopeRoot,
        foreignRoot,
        targetBranch,
        otherBranch,
        nowMs,
        leading,
        trailing,
        branchCwdUnderPayload,
        openingInsideProduct,
        openingRecordsCarryBranch,
      ],
    ) =>
      fc
        .tuple(
          arbitraryAgentSessionCwd(productScopeRoot),
          arbitraryAgentSessionCwd(foreignRoot),
          arbitraryDomainLiteral(),
          arbitraryAgentSessionCwd(productScopeRoot),
        )
        .map(([branchRecordCwd, foreignCwd, needleLiteral, secondProductCwd]) => {
          // Bound to this session's id so no sibling transcript in the store can
          // carry the needle by coincidence.
          const contentNeedle = `${needleLiteral}${NEEDLE_JOINER}${sessionId}`;
          const stamp = (index: number): string =>
            new Date(nowMs - (leading + trailing - index) * RECORD_INTERVAL_MS).toISOString();
          // The metadata head resolves each field from the first row carrying it, so a
          // transcript whose leading rows record no branch pairs a later row's branch with
          // the opening row's working directory.
          const openingCwd = openingInsideProduct ? secondProductCwd : foreignCwd;
          const openingBranch = openingRecordsCarryBranch ? otherBranch : undefined;
          const opening: ClaudeTranscriptRecord = {
            cwd: openingCwd,
            timestamp: stamp(0),
            branch: openingBranch,
          };
          const beforeBranch: ClaudeTranscriptRecord[] = Array.from({ length: leading - 1 }, (_unused, index) => ({
            cwd: openingCwd,
            timestamp: stamp(index + 1),
            branch: openingBranch,
          }));
          const branchRecord: ClaudeTranscriptRecord = {
            cwd: branchRecordCwd,
            timestamp: stamp(leading),
            branch: targetBranch,
            cwdUnderPayload: branchCwdUnderPayload,
          };
          const afterBranch: ClaudeTranscriptRecord[] = Array.from({ length: trailing }, (_unused, index) => ({
            cwd: branchRecordCwd,
            timestamp: stamp(leading + 1 + index),
            branch: otherBranch,
          }));
          const records: ClaudeTranscriptRecords = [opening, ...beforeBranch, branchRecord, ...afterBranch];
          const decoyRecords: ClaudeTranscriptRecords = [{
            cwd: branchRecordCwd,
            timestamp: stamp(0),
            branch: otherBranch,
          }];
          // The branch appears only where the working directory is foreign, while the
          // opening record sits in the product: the head pairs the two across records.
          const outOfScopeBranchRecords: ClaudeTranscriptRecords = [
            { cwd: branchRecordCwd, timestamp: stamp(0) },
            { cwd: foreignCwd, timestamp: stamp(1), branch: targetBranch },
          ];
          const foreignOnlyRecords: ClaudeTranscriptRecords = [{
            cwd: foreignCwd,
            timestamp: stamp(0),
            branch: otherBranch,
          }];
          return {
            homeDir,
            sessionId,
            productScopeRoot,
            foreignRoot,
            targetBranch,
            otherBranch,
            branchRecordIndex: leading,
            branchRecordCwd,
            records,
            contentNeedle,
            decoySessionId,
            decoyRecords,
            foreignOnlySessionId,
            foreignOnlyRecords,
            outOfScopeBranchSessionId,
            outOfScopeBranchRecords,
            nowMs,
          };
        })
    );
}

/**
 * A store whose target session opens outside the invocation product and is therefore filed
 * under a foreign project directory, beside decoy sessions filed under their own directories
 * so an enumeration of the store is distinguishable from an addressed lookup.
 */
export interface GeneratedSessionIdentityScenario {
  readonly homeDir: string;
  readonly productScopeRoot: string;
  readonly foreignRoot: string;
  readonly sessionId: string;
  readonly records: ClaudeTranscriptRecords;
  /**
   * The working directories the result may report: every in-product recorded directory when the
   * transcript records any, otherwise the opening one. Which in-product position wins is undeclared,
   * so the set carries every directory the assertion admits.
   */
  readonly acceptableCwds: readonly string[];
  readonly productDecoySessionId: string;
  readonly productDecoyRecords: ClaudeTranscriptRecords;
  readonly foreignDecoySessionId: string;
  readonly foreignDecoyRecords: ClaudeTranscriptRecords;
  readonly nowMs: number;
}

export function arbitrarySessionIdentityScenario(): fc.Arbitrary<GeneratedSessionIdentityScenario> {
  return fc
    .tuple(
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentSessionId(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentResumeNowMs(),
      fc.integer({ min: MIN_TRAILING_RECORDS, max: MAX_TRAILING_RECORDS }),
      fc.boolean(),
      fc.boolean(),
      fc.integer({ min: 0, max: MAX_TRAILING_RECORDS }),
    )
    .chain((
      [
        sessionId,
        productDecoySessionId,
        foreignDecoySessionId,
        homeDir,
        productScopeRoot,
        foreignRoot,
        nowMs,
        trailing,
        recordsProductCwd,
        productCwdUnderPayload,
        productRecordOffset,
      ],
    ) =>
      fc
        .tuple(
          arbitraryAgentSessionCwd(foreignRoot),
          arbitraryAgentSessionCwd(productScopeRoot),
          arbitraryAgentSessionCwd(productScopeRoot),
          arbitraryAgentSessionCwd(productScopeRoot),
          arbitraryAgentSessionCwd(foreignRoot),
        )
        .map(([openingCwd, productCwd, secondProductCwd, decoyProductCwd, decoyForeignCwd]) => {
          const stamp = (index: number): string =>
            new Date(nowMs - (trailing + 1 - index) * RECORD_INTERVAL_MS).toISOString();
          // The opening record decides the project directory the store files this
          // transcript under, so it stays outside the invocation product.
          const opening: ClaudeTranscriptRecord = { cwd: openingCwd, timestamp: stamp(0) };
          const recordsProductPosition = recordsProductCwd && trailing > 0;
          // Trailing records interleave foreign and in-product directories around a first
          // in-product position, so no single position is the only one the assertion admits.
          const firstProductIndex = recordsProductPosition ? productRecordOffset % trailing : -1;
          const trailingCwd = (index: number): string => {
            if (!recordsProductPosition || index < firstProductIndex) {
              return openingCwd;
            }
            if (index === firstProductIndex) {
              return productCwd;
            }
            return index % 2 === 0 ? secondProductCwd : openingCwd;
          };
          const later: ClaudeTranscriptRecord[] = Array.from({ length: trailing }, (_unused, index) => ({
            cwd: trailingCwd(index),
            timestamp: stamp(index + 1),
            cwdUnderPayload: recordsProductPosition && index === firstProductIndex ? productCwdUnderPayload : false,
          }));
          return {
            homeDir,
            productScopeRoot,
            foreignRoot,
            sessionId,
            records: [opening, ...later] as ClaudeTranscriptRecords,
            acceptableCwds: recordsProductPosition
              ? [...new Set(later.map((record) => record.cwd).filter((cwd) => cwd !== openingCwd))]
              : [openingCwd],
            productDecoySessionId,
            productDecoyRecords: [{ cwd: decoyProductCwd, timestamp: stamp(0) }] as ClaudeTranscriptRecords,
            foreignDecoySessionId,
            foreignDecoyRecords: [{ cwd: decoyForeignCwd, timestamp: stamp(0) }] as ClaudeTranscriptRecords,
            nowMs,
          };
        })
    );
}

const PARENT_DIRECTORY_SEGMENT = "..";
const CURRENT_DIRECTORY_SEGMENT = ".";
const EMPTY_SESSION_ID = "";
const POSIX_PATH_SEPARATOR = "/";
const WINDOWS_PATH_SEPARATOR = "\\";

/** A store holding one addressable session, plus session ids that name no single store entry. */
export interface GeneratedUnsafeSessionIdScenario {
  readonly homeDir: string;
  readonly productScopeRoot: string;
  readonly sessionId: string;
  readonly cwd: string;
  readonly unsafeSessionIds: readonly string[];
  readonly nowMs: number;
}

export function arbitraryUnsafeSessionIdScenario(): fc.Arbitrary<GeneratedUnsafeSessionIdScenario> {
  return fc
    .tuple(
      arbitraryAgentSessionId(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentWorktreeRoot(),
      arbitraryAgentResumeNowMs(),
      arbitraryDomainLiteral(),
      arbitraryDomainLiteral(),
    )
    .chain(([sessionId, homeDir, productScopeRoot, nowMs, head, tail]) =>
      fc.tuple(arbitraryAgentSessionCwd(productScopeRoot)).map(([cwd]) => ({
        homeDir,
        productScopeRoot,
        sessionId,
        cwd,
        unsafeSessionIds: [
          `${PARENT_DIRECTORY_SEGMENT}${POSIX_PATH_SEPARATOR}${head}`,
          `${head}${POSIX_PATH_SEPARATOR}${tail}`,
          `${head}${WINDOWS_PATH_SEPARATOR}${tail}`,
          `${POSIX_PATH_SEPARATOR}${head}`,
          PARENT_DIRECTORY_SEGMENT,
          `${PARENT_DIRECTORY_SEGMENT}${POSIX_PATH_SEPARATOR}${PARENT_DIRECTORY_SEGMENT}${POSIX_PATH_SEPARATOR}${head}`,
          CURRENT_DIRECTORY_SEGMENT,
          EMPTY_SESSION_ID,
        ],
        nowMs,
      }))
    );
}

export interface AgentSearchBranchCommandEvidenceCase {
  readonly command: string;
  readonly expected: boolean;
  readonly branch?: string;
}

export const AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE = {
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
  SHELL_FALSE_COMMAND: "false",
  SHELL_BOURNE_WRAPPER: "sh",
  SHELL_BASH_WRAPPER: "bash",
  SHELL_COMMAND_STRING_FLAG: "-c",
  SHELL_LOGIN_COMMAND_STRING_FLAG: "-lc",
  SHELL_DONE_MARKER: "done",
  SHELL_TEE_COMMAND: "tee",
  SHELL_TEE_PATH: "branch-search.log",
  SHELL_ECHO_COMMAND: "echo",
  SHELL_ECHO_VALUE: "ready",
  SHELL_REDIRECT_PATH: "/dev/null",
  CODEX_CALL_ID: "call_agent_search_branch_command",
  CLAUDE_TOOL_USE_ID: "toolu_agent_search_branch_command",
  UNSUPPORTED_TRACK_MODE_FLAG: "--track=bogus",
  LOCK_REASON: "agent-search-branch-lock",
  SUBMODULE_CHECKOUT_MODE: "on-demand",
  CONFLICT_STYLE: "zdiff3",
  GIT_DIR_PATH: "../repo/.git",
  GIT_WORK_TREE_PATH: "../repo",
  GIT_NAMESPACE: "agent-search",
  GIT_CONFIG_ENV: "protocol.version=SPX_PROTOCOL_VERSION",
} as const;

export function agentSearchSwitchCommand(branch: string): string {
  return `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`;
}

export function agentSearchSwitchCreateCommand(branch: string): string {
  return `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`;
}

export function agentSearchWorktreeResetAddCommand(branch: string): string {
  return `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`;
}

export function agentSearchBranchCommandEvidenceCases(
  branch: string,
): readonly AgentSearchBranchCommandEvidenceCase[] {
  const shellAnd =
    `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_AMPERSAND}${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_AMPERSAND}`;
  return [
    { command: agentSearchSwitchCommand(branch), expected: true },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFIG} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_CONFIG_ASSIGNMENT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHANGE_DIRECTORY} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.GIT_DIR}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_DIR_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORK_TREE}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_WORK_TREE_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.GIT_DIR} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_DIR_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORK_TREE} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_WORK_TREE_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.NAMESPACE}=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_NAMESPACE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFIG_ENV} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_CONFIG_ENV} ${AGENT_TRANSCRIPT_GIT_COMMAND.NO_OPTIONAL_LOCKS} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
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
        `GIT_DIR=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_DIR_PATH} GIT_WORK_TREE=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_WORK_TREE_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `env GIT_DIR=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_DIR_PATH} GIT_WORK_TREE=${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.GIT_WORK_TREE_PATH} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
    },
    {
      command:
        `cd ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH}${shellAnd}${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_ECHO_COMMAND} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_ECHO_VALUE} ${shellAnd} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_FALSE_COMMAND} ${shellAnd} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}`,
      expected: false,
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}${shellAnd}cd ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH}`,
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
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BOURNE_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_COMMAND_STRING_FLAG} '${
          agentSearchSwitchCommand(branch)
        }'`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BASH_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_LOGIN_COMMAND_STRING_FLAG} '${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}'`,
      expected: false,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BASH_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_LOGIN_COMMAND_STRING_FLAG} '${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} fetch${shellAnd}${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}'`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BASH_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_LOGIN_COMMAND_STRING_FLAG} '${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}${shellAnd}cd ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH}'`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_BASH_WRAPPER} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_LOGIN_COMMAND_STRING_FLAG} 'cd ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_CD_PATH}${shellAnd}${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${branch}'`,
      expected: false,
    },
    {
      command: `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_COMMAND_WRAPPER} ${agentSearchSwitchCommand(branch)}`,
      expected: true,
    },
    {
      command:
        `${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.SHELL_SUDO_WRAPPER} ${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG} ${branch}`,
      expected: true,
    },
    { command: agentSearchSwitchCreateCommand(branch), expected: true },
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG}=${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_LONG}${branch}`,
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG}=${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_RESET_LONG} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN}=${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.SWITCH} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SWITCH_LONG}=`,
      expected: false,
    },
    {
      command: `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${branch}`,
      expected: false,
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT}${branch}`,
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.TRACK} origin/${branch}`,
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
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.RECURSE_SUBMODULES} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CONFLICT} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.CONFLICT_STYLE} ${branch}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT}${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN} ${branch}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.CHECKOUT} ${AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN}=${branch}`,
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
      expected: false,
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
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_SHORT}${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
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
    { command: agentSearchWorktreeResetAddCommand(branch), expected: true },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT}${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.CREATE_BRANCH_RESET_SHORT} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.START_POINT}`,
      expected: true,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_TRANSCRIPT_GIT_COMMAND.ORPHAN} ${branch} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
      expected: false,
    },
    {
      command:
        `${AGENT_TRANSCRIPT_GIT_COMMAND.EXECUTABLE} ${AGENT_TRANSCRIPT_GIT_COMMAND.WORKTREE} ${AGENT_TRANSCRIPT_GIT_COMMAND.ADD} ${AGENT_SEARCH_TRANSCRIPT_COMMAND_SAMPLE.WORKTREE_ADD_PATH}`,
      expected: false,
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
      command: `echo ${agentSearchSwitchCommand(branch)}`,
      expected: false,
    },
  ];
}
