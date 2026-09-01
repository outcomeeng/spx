import { pathToFileURL } from "node:url";

import { agentHomeDirsFromHomeDir } from "@/domains/agent/home";
import {
  AGENT_RESUME_LIMITS,
  AGENT_SESSION_JSON_FIELDS,
  AGENT_SESSION_ROW_TYPE,
  CODEX_TRANSCRIPT_ITEM_TYPE,
} from "@/domains/agent/protocol";
import {
  agentSessionJsonlName,
  buildAgentResumeLaunchCommand,
  discoverAgentResumeCandidates,
  parseCodexWorkingDirRecords,
  worktreeResumeScope,
} from "@/domains/agent/resume";
import {
  arbitraryAgentResumeNowMs,
  arbitraryAgentResumeRecentOffsetMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  agentResumeWorktreeRootResolver,
  agentTranscriptActivityRow,
  codexTranscript,
  codexTranscriptPath,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

const RECORD_SCOPE_SAMPLE = {
  NOW_MS: 501,
  WORKTREE_ROOT: 502,
  FORK_ROOT: 503,
  OUTSIDE_RECORD_ROOT: 504,
  HOME_DIR: 505,
  FORK_SESSION_ID: 506,
  OUTSIDE_SESSION_ID: 507,
  INVOCATION_CWD: 508,
  EARLIER_RECORD_CWD: 509,
  NEWEST_RECORD_CWD: 510,
  OUTSIDE_RECORD_CWD: 511,
  ACTIVITY_OFFSET_MS: 512,
  PLAIN_PATH_CWD: 513,
  FILE_URI_SOURCE_CWD: 514,
  META_CWD: 515,
  PARSE_SESSION_ID: 516,
  MID_WINDOW_SESSION_ID: 517,
  FALLBACK_SESSION_ID: 518,
  FALLBACK_OPENING_CWD: 519,
  MID_WINDOW_RECORD_CWD: 520,
  RECORD_IN_SCOPE_SESSION_ID: 521,
  RECORD_IN_SCOPE_CWD: 522,
  NON_COMMAND_ITEM_CWD: 523,
} as const;

const TAIL_FILLER_CHAR = "x";
const TAIL_FILLER_MULTIPLIER = 2;

export function codexTurnContextRow(cwd: string): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.TYPE]: AGENT_SESSION_ROW_TYPE.CODEX_TURN_CONTEXT,
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: { [AGENT_SESSION_JSON_FIELDS.CWD]: cwd },
  });
}

export function codexCommandExecutionItemRow(cwd: string): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.ITEM]: {
        [AGENT_SESSION_JSON_FIELDS.TYPE]: CODEX_TRANSCRIPT_ITEM_TYPE.COMMAND_EXECUTION,
        [AGENT_SESSION_JSON_FIELDS.CWD]: pathToFileURL(cwd).href,
      },
    },
  });
}

export function codexNonCommandItemRow(cwd: string): string {
  return JSON.stringify({
    [AGENT_SESSION_JSON_FIELDS.PAYLOAD]: {
      [AGENT_SESSION_JSON_FIELDS.ITEM]: { [AGENT_SESSION_JSON_FIELDS.CWD]: pathToFileURL(cwd).href },
    },
  });
}

interface RecordScopeDiscoveryInput {
  readonly fs: MemoryAgentSessionFileSystem;
  readonly homeDir: string;
  readonly worktreeRoot: string;
  readonly invocationCwd: string;
  readonly nowMs: number;
}

async function discoverWorktreeScopedCandidates(input: RecordScopeDiscoveryInput) {
  return discoverAgentResumeCandidates({
    invocationDir: input.invocationCwd,
    agentHomeDirs: agentHomeDirsFromHomeDir(input.homeDir),
    nowMs: input.nowMs,
    scope: worktreeResumeScope(),
    fs: input.fs,
    resolveWorktreeRoot: agentResumeWorktreeRootResolver(input.worktreeRoot),
  });
}

export interface CodexForkedRecordScopeEvidence {
  readonly candidateSessionIds: readonly string[];
  readonly candidateCwds: ReadonlyMap<string, string>;
  readonly launchCwds: ReadonlyMap<string, string>;
  readonly forkSessionId: string;
  readonly outsideSessionId: string;
  readonly newestInScopeRecordCwd: string;
}

export async function withCodexForkedRecordScopeEvidence(
  assert: (evidence: CodexForkedRecordScopeEvidence) => void,
): Promise<void> {
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), RECORD_SCOPE_SAMPLE.NOW_MS);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.WORKTREE_ROOT);
  const forkRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.FORK_ROOT);
  const outsideRecordRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    RECORD_SCOPE_SAMPLE.OUTSIDE_RECORD_ROOT,
  );
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.HOME_DIR);
  const forkSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), RECORD_SCOPE_SAMPLE.FORK_SESSION_ID);
  const outsideSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), RECORD_SCOPE_SAMPLE.OUTSIDE_SESSION_ID);
  const invocationCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.INVOCATION_CWD,
  );
  const earlierRecordCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.EARLIER_RECORD_CWD,
  );
  const newestInScopeRecordCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.NEWEST_RECORD_CWD,
  );
  const outsideRecordCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(outsideRecordRoot),
    RECORD_SCOPE_SAMPLE.OUTSIDE_RECORD_CWD,
  );
  const activityOffsetMs = sampleAgentResumeValue(
    arbitraryAgentResumeRecentOffsetMs(),
    RECORD_SCOPE_SAMPLE.ACTIVITY_OFFSET_MS,
  );
  const timestamp = new Date(nowMs - activityOffsetMs).toISOString();
  const modifiedAtMs = nowMs - activityOffsetMs;

  const fs = new MemoryAgentSessionFileSystem();
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(forkSessionId)),
    [
      codexTranscript({ sessionId: forkSessionId, cwd: forkRoot, timestamp }),
      codexCommandExecutionItemRow(earlierRecordCwd),
      codexCommandExecutionItemRow(newestInScopeRecordCwd),
      agentTranscriptActivityRow(timestamp),
    ].join("\n"),
    modifiedAtMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(outsideSessionId)),
    [
      codexTranscript({ sessionId: outsideSessionId, cwd: forkRoot, timestamp }),
      codexCommandExecutionItemRow(outsideRecordCwd),
      agentTranscriptActivityRow(timestamp),
    ].join("\n"),
    modifiedAtMs,
  );

  const candidates = await discoverWorktreeScopedCandidates({ fs, homeDir, worktreeRoot, invocationCwd, nowMs });
  assert({
    candidateSessionIds: candidates.map((candidate) => candidate.sessionId),
    candidateCwds: new Map(candidates.map((candidate) => [candidate.sessionId, candidate.cwd])),
    launchCwds: new Map(
      candidates.map((candidate) => [candidate.sessionId, buildAgentResumeLaunchCommand(candidate).cwd]),
    ),
    forkSessionId,
    outsideSessionId,
    newestInScopeRecordCwd,
  });
}

export interface CodexRecordParsingEvidence {
  readonly records: readonly string[];
  readonly plainPathCwd: string;
  readonly fileUriSourceCwd: string;
  readonly nonCommandItemCwd: string;
}

export function withCodexRecordParsingEvidence(
  assert: (evidence: CodexRecordParsingEvidence) => void,
): void {
  const metaRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.META_CWD);
  const plainPathCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(metaRoot),
    RECORD_SCOPE_SAMPLE.PLAIN_PATH_CWD,
  );
  const fileUriSourceCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(metaRoot),
    RECORD_SCOPE_SAMPLE.FILE_URI_SOURCE_CWD,
  );
  const nonCommandItemCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(metaRoot),
    RECORD_SCOPE_SAMPLE.NON_COMMAND_ITEM_CWD,
  );
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), RECORD_SCOPE_SAMPLE.PARSE_SESSION_ID);
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), RECORD_SCOPE_SAMPLE.NOW_MS);
  const timestamp = new Date(nowMs).toISOString();
  const slice = [
    codexTranscript({ sessionId, cwd: metaRoot, timestamp }),
    codexTurnContextRow(plainPathCwd),
    codexCommandExecutionItemRow(fileUriSourceCwd),
    codexNonCommandItemRow(nonCommandItemCwd),
    agentTranscriptActivityRow(timestamp),
  ].join("\n");
  assert({ records: parseCodexWorkingDirRecords(slice), plainPathCwd, fileUriSourceCwd, nonCommandItemCwd });
}

export interface CodexRecordWindowEvidence {
  readonly candidateSessionIds: readonly string[];
  readonly candidateCwds: ReadonlyMap<string, string>;
  readonly midWindowSessionId: string;
  readonly fallbackSessionId: string;
  readonly fallbackOpeningCwd: string;
  readonly outsideSessionId: string;
  readonly recordInScopeSessionId: string;
  readonly recordInScopeCwd: string;
  readonly maxHeadReadBytes: number;
  readonly maxTailReadBytes: number;
}

export async function withCodexRecordWindowEvidence(
  assert: (evidence: CodexRecordWindowEvidence) => void,
): Promise<void> {
  const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs(), RECORD_SCOPE_SAMPLE.NOW_MS);
  const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.WORKTREE_ROOT);
  const forkRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.FORK_ROOT);
  const outsideRecordRoot = sampleAgentResumeValue(
    arbitraryAgentWorktreeRoot(),
    RECORD_SCOPE_SAMPLE.OUTSIDE_RECORD_ROOT,
  );
  const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), RECORD_SCOPE_SAMPLE.HOME_DIR);
  const midWindowSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    RECORD_SCOPE_SAMPLE.MID_WINDOW_SESSION_ID,
  );
  const recordInScopeSessionId = sampleAgentResumeValue(
    arbitraryAgentSessionId(),
    RECORD_SCOPE_SAMPLE.RECORD_IN_SCOPE_SESSION_ID,
  );
  const recordInScopeCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.RECORD_IN_SCOPE_CWD,
  );
  const fallbackSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), RECORD_SCOPE_SAMPLE.FALLBACK_SESSION_ID);
  const outsideSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), RECORD_SCOPE_SAMPLE.OUTSIDE_SESSION_ID);
  const invocationCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.INVOCATION_CWD,
  );
  const midWindowRecordCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.MID_WINDOW_RECORD_CWD,
  );
  const fallbackOpeningCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(worktreeRoot),
    RECORD_SCOPE_SAMPLE.FALLBACK_OPENING_CWD,
  );
  const outsideRecordCwd = sampleAgentResumeValue(
    arbitraryAgentSessionCwd(outsideRecordRoot),
    RECORD_SCOPE_SAMPLE.OUTSIDE_RECORD_CWD,
  );
  const activityOffsetMs = sampleAgentResumeValue(
    arbitraryAgentResumeRecentOffsetMs(),
    RECORD_SCOPE_SAMPLE.ACTIVITY_OFFSET_MS,
  );
  const timestamp = new Date(nowMs - activityOffsetMs).toISOString();
  const modifiedAtMs = nowMs - activityOffsetMs;

  const fs = new MemoryAgentSessionFileSystem();
  const midWindowPath = codexTranscriptPath(homeDir, agentSessionJsonlName(midWindowSessionId));
  fs.writeFile(
    midWindowPath,
    [
      codexTranscript({
        sessionId: midWindowSessionId,
        cwd: forkRoot,
        timestamp,
        padToBytes: AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES,
      }),
      codexTurnContextRow(midWindowRecordCwd),
      TAIL_FILLER_CHAR.repeat(AGENT_RESUME_LIMITS.ACTIVITY_TAIL_BYTES * TAIL_FILLER_MULTIPLIER),
    ].join("\n"),
    modifiedAtMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(fallbackSessionId)),
    [
      codexTranscript({ sessionId: fallbackSessionId, cwd: fallbackOpeningCwd, timestamp }),
      codexCommandExecutionItemRow(outsideRecordCwd),
      agentTranscriptActivityRow(timestamp),
    ].join("\n"),
    modifiedAtMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(outsideSessionId)),
    [
      codexTranscript({ sessionId: outsideSessionId, cwd: forkRoot, timestamp }),
      codexCommandExecutionItemRow(outsideRecordCwd),
      agentTranscriptActivityRow(timestamp),
    ].join("\n"),
    modifiedAtMs,
  );
  fs.writeFile(
    codexTranscriptPath(homeDir, agentSessionJsonlName(recordInScopeSessionId)),
    [
      codexTranscript({ sessionId: recordInScopeSessionId, cwd: forkRoot, timestamp }),
      codexCommandExecutionItemRow(recordInScopeCwd),
      agentTranscriptActivityRow(timestamp),
    ].join("\n"),
    modifiedAtMs,
  );

  const candidates = await discoverWorktreeScopedCandidates({ fs, homeDir, worktreeRoot, invocationCwd, nowMs });
  assert({
    candidateSessionIds: candidates.map((candidate) => candidate.sessionId),
    candidateCwds: new Map(candidates.map((candidate) => [candidate.sessionId, candidate.cwd])),
    midWindowSessionId,
    fallbackSessionId,
    fallbackOpeningCwd,
    outsideSessionId,
    recordInScopeSessionId,
    recordInScopeCwd,
    maxHeadReadBytes: fs.maxHeadReadBytes(midWindowPath),
    maxTailReadBytes: fs.maxTailReadBytes(midWindowPath),
  });
}
