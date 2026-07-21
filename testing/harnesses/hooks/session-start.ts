import { mkdir, open, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/status";
import type { Result } from "@/config/types";
import { AGENT_HOME_ENV } from "@/domains/agent/home";
import { AGENT_SESSION_KIND, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  type HookSessionStartEnv,
  type PiSessionStartRejectionKind,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_CLAIM, readClaim, type WorktreeClaimRecord } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import {
  type HookTranscriptFileSystem,
  runSessionStartHook,
  type SessionStartHookResult,
} from "@/interfaces/hooks/session-start";
import type { RandomBytes } from "@/lib/atomic-file-write";
import { defaultGitDependencies } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultProcessTable } from "@/lib/worktree-process-table";
import { arbitraryUnknownHookEvent } from "@testing/generators/hooks/session-start";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  samplePathUnsafeAgentSessionIdentity,
  sampleWhitespaceAgentSessionIdentity,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { piTranscript } from "@testing/harnesses/agent/pi-resume";
import { agentSessionJsonlName } from "@testing/harnesses/agent/resume";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import {
  runWorktreeCli,
  type SpxCliResult,
  withWorktreePool,
  type WorktreePoolEnv,
} from "@testing/harnesses/worktree/harness";

export interface SessionStartIdentityEvidence {
  readonly result: Result<SessionStartHookResult>;
  readonly envContent: string;
  readonly payloadSessionId?: string;
  readonly claudeSessionId?: string;
  readonly codexSessionId?: string;
}

export interface UnsafePayloadSessionStartIdentityEvidence extends SessionStartIdentityEvidence {
  readonly payloadSessionId: string;
}

export interface PiSessionStartIdentityEvidence {
  readonly result: Result<SessionStartHookResult>;
  readonly sessionId: string;
  readonly decoySessionId: string;
  readonly transcriptPath: string;
  readonly transcriptPathsRead: readonly string[];
}

export interface SessionStartCliAcceptanceEvidence {
  readonly acceptedResult: SpxCliResult;
  readonly rejectedResult: SpxCliResult;
}

export interface SessionStartCliClaimEvidence {
  readonly result: SpxCliResult;
  readonly sessionId: string;
  readonly claim: WorktreeClaimRecord | undefined;
  readonly envContent: string;
  readonly originalEnvLine: string;
  readonly claimPath: string;
  readonly host: string;
  readonly pid: number;
  readonly startedAt: string | undefined;
  readonly productDir: string;
}

export interface PiSessionStartCliClaimEvidence {
  readonly hookResult: SpxCliResult;
  readonly statusResult: SpxCliResult;
  readonly sessionId: string;
  readonly decoySessionId: string;
}

export interface PiSessionStartRejectionEvidence {
  readonly result: Result<SessionStartHookResult>;
  readonly transcriptPathsRead: readonly string[];
}

export interface PiSessionStartRejectionMappingEvidence extends PiSessionStartRejectionEvidence {
  readonly rejectionKind: PiSessionStartRejectionKind;
}

export interface PiSessionStartCliRejectionEvidence {
  readonly hookResult: SpxCliResult;
  readonly statusResult: SpxCliResult;
  readonly envContent: string;
}

export interface PiSessionStartCliRejectionMappingEvidence extends PiSessionStartCliRejectionEvidence {
  readonly rejectionKind: PiSessionStartRejectionKind;
}

interface PiTranscriptFixtureEnv {
  readonly productDir: string;
  readonly sessionStoreDir: string;
  readonly untrustedDir: string;
}

type PiTranscriptFixtureSetup = (
  env: PiTranscriptFixtureEnv,
  sessionId: string,
) => Promise<string | undefined>;

interface DirectIdentityInput {
  readonly payloadSessionId?: string;
  readonly envOverlay: HookSessionStartEnv;
  readonly evidence: {
    readonly payloadSessionId?: string;
    readonly claudeSessionId?: string;
    readonly codexSessionId?: string;
  };
}

class RecordingHookTranscriptFileSystem implements HookTranscriptFileSystem {
  readonly pathsRead: string[] = [];

  constructor(private readonly delegate: HookTranscriptFileSystem) {}

  async realPath(path: string): Promise<string> {
    return this.delegate.realPath(path);
  }

  async readHead(path: string, maxBytes: number): Promise<string> {
    this.pathsRead.push(path);
    return this.delegate.readHead(path, maxBytes);
  }
}

const nodeHookTranscriptFileSystem: HookTranscriptFileSystem = {
  realPath: realpath,
  async readHead(path, maxBytes) {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.toString(AGENT_SESSION_STORE.TEXT_ENCODING, 0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};

function hookContent(env: WorktreePoolEnv, sessionId?: string): string {
  return JSON.stringify({
    ...(sessionId === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId }),
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
  });
}

function hookEnvWithHolder(
  env: WorktreePoolEnv,
  envFile: string,
  overlay: HookSessionStartEnv,
): HookSessionStartEnv {
  return {
    [CONTROLLING_PID_ENV]: String(env.holder.pid),
    [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
    ...overlay,
  };
}

async function runSessionStartIdentityScenario(
  env: WorktreePoolEnv,
  input: {
    readonly claimRandomBytes: RandomBytes;
    readonly content: string;
    readonly env: HookSessionStartEnv;
    readonly transcriptFileSystem?: HookTranscriptFileSystem;
  },
): Promise<Result<SessionStartHookResult>> {
  return runSessionStartHook({
    claimRandomBytes: input.claimRandomBytes,
    compactStdout: false,
    content: input.content,
    cwd: env.container,
    envFile: input.env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE],
    fs: env.fs,
    gitDeps: defaultGitDependencies,
    worktreesDir: env.worktreesDir,
    processTable: env.processTable,
    selfPid: env.holder.pid,
    env: input.env,
    transcriptFileSystem: input.transcriptFileSystem ?? nodeHookTranscriptFileSystem,
  });
}

async function withDirectIdentityEvidence(
  input: DirectIdentityInput,
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  await withWorktreePool(
    {
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      holder: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder()),
    },
    async (env) => {
      const envFile = join(env.container, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
        content: hookContent(env, input.payloadSessionId),
        env: hookEnvWithHolder(env, envFile, input.envOverlay),
      });
      await callback({
        ...input.evidence,
        result,
        envContent: await readFile(envFile, HOOK_ENV_FILE.ENCODING),
      });
    },
  );
}

export async function withCodexSessionStartIdentityEvidence(
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const codexSessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
  await withDirectIdentityEvidence(
    {
      envOverlay: { [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexSessionId },
      evidence: { codexSessionId },
    },
    callback,
  );
}

export async function withUnsafePayloadSessionStartIdentityEvidence(
  callback: (evidence: UnsafePayloadSessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const payloadSessionId = samplePathUnsafeAgentSessionIdentity();
  await withDirectIdentityEvidence(
    { payloadSessionId, envOverlay: {}, evidence: { payloadSessionId } },
    async (evidence) => callback({ ...evidence, payloadSessionId }),
  );
}

export async function withClaudePrecedenceSessionStartIdentityEvidence(
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const [claudeSessionId, codexSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
  await withDirectIdentityEvidence(
    {
      envOverlay: {
        [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId,
        [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexSessionId,
      },
      evidence: { claudeSessionId, codexSessionId },
    },
    callback,
  );
}

export async function withWhitespaceClaudeSessionStartIdentityEvidence(
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const codexSessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
  await withDirectIdentityEvidence(
    {
      envOverlay: {
        [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: sampleWhitespaceAgentSessionIdentity(),
        [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexSessionId,
      },
      evidence: { codexSessionId },
    },
    callback,
  );
}

export async function withPayloadPrecedenceSessionStartIdentityEvidence(
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const [payloadSessionId, claudeSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
  await withDirectIdentityEvidence(
    {
      payloadSessionId,
      envOverlay: { [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId },
      evidence: { payloadSessionId, claudeSessionId },
    },
    callback,
  );
}

export async function withPiSessionStartIdentityEvidence(
  callback: (evidence: PiSessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  await withWorktreePool(
    {
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      holder: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder()),
    },
    async (env) => {
      const [sessionId, decoySessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
      const [timestamp, decoyTimestamp] = orderedDistinctTimestamps();
      const sessionStoreDir = join(env.container, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      await mkdir(sessionStoreDir);
      const transcriptPath = join(sessionStoreDir, agentSessionJsonlName(sessionId));
      await writeFile(
        transcriptPath,
        piTranscript({ sessionId, cwd: env.worktreePath, timestamp }),
        AGENT_SESSION_STORE.TEXT_ENCODING,
      );
      await writeFile(
        join(sessionStoreDir, agentSessionJsonlName(decoySessionId)),
        piTranscript({ sessionId: decoySessionId, cwd: env.worktreePath, timestamp: decoyTimestamp }),
        AGENT_SESSION_STORE.TEXT_ENCODING,
      );
      const transcriptFileSystem = new RecordingHookTranscriptFileSystem(nodeHookTranscriptFileSystem);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
        content: JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.AGENT]: AGENT_SESSION_KIND.PI,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]: transcriptPath,
        }),
        env: {
          [AGENT_HOME_ENV.PI_SESSIONS]: sessionStoreDir,
          [CONTROLLING_PID_ENV]: String(env.holder.pid),
        },
        transcriptFileSystem,
      });
      await callback({
        sessionId,
        decoySessionId,
        transcriptPath,
        transcriptPathsRead: transcriptFileSystem.pathsRead,
        result,
      });
    },
  );
}

export async function withSessionStartCliAcceptanceEvidence(
  callback: (evidence: SessionStartCliAcceptanceEvidence) => void | Promise<void>,
): Promise<void> {
  await withHookCliWorktreeEnv(
    {
      envFileName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()),
      prefix: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()),
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
    },
    async (env) => {
      const cliEnv = {
        [CONTROLLING_PID_ENV]: String(process.pid),
        [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
      };
      await callback({
        acceptedResult: await runWorktreeCli(
          [
            HOOK_CLI.COMMAND,
            HOOK_CLI.RUN,
            HOOK_EVENT.SESSION_START,
            HOOK_CLI.WORKTREES_DIR_FLAG,
            env.worktreesDir,
          ],
          cliEnv,
          env.worktreePath,
          JSON.stringify({
            [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
            [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          }),
        ),
        rejectedResult: await runWorktreeCli(
          [
            HOOK_CLI.COMMAND,
            HOOK_CLI.RUN,
            sampleLiteralTestValue(arbitraryUnknownHookEvent()),
            HOOK_CLI.WORKTREES_DIR_FLAG,
            env.worktreesDir,
          ],
          cliEnv,
          env.worktreePath,
        ),
      });
    },
  );
}

export async function withSessionStartCliClaimEvidence(
  callback: (evidence: SessionStartCliClaimEvidence) => void | Promise<void>,
): Promise<void> {
  await withHookCliWorktreeEnv(
    {
      envFileName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()),
      prefix: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()),
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
    },
    async (env) => {
      const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
      const originalEnvLine = `${HOOK_ENV_FILE.EXPORT_PREFIX}${CONTROLLING_PID_ENV}=${
        sampleWorktreeTestValue(
          WORKTREE_TEST_GENERATOR.sessionId(),
        )
      }\n`;
      await writeFile(env.envFile, originalEnvLine, HOOK_ENV_FILE.ENCODING);
      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.ENV_FILE_FLAG,
          env.envFile,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        { [CONTROLLING_PID_ENV]: String(process.pid) },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
      );
      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claimResult = await readClaim(env.worktreesDir, claimName, { fs: defaultOccupancyFileSystem });
      if (!claimResult.ok) throw new Error(claimResult.error);
      await callback({
        result,
        sessionId,
        claim: claimResult.value,
        envContent: await readFile(env.envFile, HOOK_ENV_FILE.ENCODING),
        originalEnvLine,
        claimPath: join(env.worktreesDir, `${claimName}${OCCUPANCY_CLAIM.FILE_EXTENSION}`),
        host: defaultProcessTable.currentHost(),
        pid: process.pid,
        startedAt: defaultProcessTable.startTimeOf(process.pid),
        productDir: env.worktreePath,
      });
    },
  );
}

export async function withPiSessionStartCliClaimEvidence(
  callback: (evidence: PiSessionStartCliClaimEvidence) => void | Promise<void>,
): Promise<void> {
  await withHookCliWorktreeEnv(
    {
      envFileName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()),
      prefix: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()),
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
    },
    async (env) => {
      const [sessionId, decoySessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
      const [timestamp, decoyTimestamp] = orderedDistinctTimestamps();
      const sessionStoreDir = join(
        env.worktreesDir,
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      );
      await mkdir(sessionStoreDir);
      const transcriptPath = join(sessionStoreDir, agentSessionJsonlName(sessionId));
      await writeFile(
        transcriptPath,
        piTranscript({ sessionId, cwd: env.worktreePath, timestamp }),
        AGENT_SESSION_STORE.TEXT_ENCODING,
      );
      await writeFile(
        join(sessionStoreDir, agentSessionJsonlName(decoySessionId)),
        piTranscript({ sessionId: decoySessionId, cwd: env.worktreePath, timestamp: decoyTimestamp }),
        AGENT_SESSION_STORE.TEXT_ENCODING,
      );
      const hookResult = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        {
          [AGENT_HOME_ENV.PI_SESSIONS]: sessionStoreDir,
          [CONTROLLING_PID_ENV]: String(process.pid),
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.AGENT]: AGENT_SESSION_KIND.PI,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]: transcriptPath,
        }),
      );
      await callback({
        hookResult,
        statusResult: await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            env.worktreesDir,
          ],
          {},
          env.worktreePath,
        ),
        sessionId,
        decoySessionId,
      });
    },
  );
}

async function withPiSessionStartRejectionEvidence(
  setup: PiTranscriptFixtureSetup,
  callback: (evidence: PiSessionStartRejectionEvidence) => void | Promise<void>,
): Promise<void> {
  await withWorktreePool(
    {
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      holder: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder()),
    },
    async (env) => {
      const sessionStoreDir = join(env.container, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      await mkdir(sessionStoreDir);
      const transcriptPath = await setup(
        { productDir: env.worktreePath, sessionStoreDir, untrustedDir: env.container },
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
      );
      const transcriptFileSystem = new RecordingHookTranscriptFileSystem(nodeHookTranscriptFileSystem);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
        content: JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.AGENT]: AGENT_SESSION_KIND.PI,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          ...(transcriptPath === undefined
            ? {}
            : { [HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]: transcriptPath }),
        }),
        env: {
          [AGENT_HOME_ENV.PI_SESSIONS]: sessionStoreDir,
          [CONTROLLING_PID_ENV]: String(env.holder.pid),
        },
        transcriptFileSystem,
      });
      await callback({ result, transcriptPathsRead: transcriptFileSystem.pathsRead });
    },
  );
}

async function withPiSessionStartCliRejectionEvidence(
  setup: PiTranscriptFixtureSetup,
  callback: (evidence: PiSessionStartCliRejectionEvidence) => void | Promise<void>,
): Promise<void> {
  await withHookCliWorktreeEnv(
    {
      envFileName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()),
      prefix: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()),
      worktreeName: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
    },
    async (env) => {
      const sessionStoreDir = join(
        env.worktreesDir,
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      );
      await mkdir(sessionStoreDir);
      const transcriptPath = await setup(
        { productDir: env.worktreePath, sessionStoreDir, untrustedDir: env.worktreesDir },
        sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
      );
      const hookResult = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.ENV_FILE_FLAG,
          env.envFile,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        {
          [AGENT_HOME_ENV.PI_SESSIONS]: sessionStoreDir,
          [CONTROLLING_PID_ENV]: String(process.pid),
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.AGENT]: AGENT_SESSION_KIND.PI,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          ...(transcriptPath === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]: transcriptPath }),
        }),
      );
      await callback({
        hookResult,
        statusResult: await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            env.worktreesDir,
          ],
          {},
          env.worktreePath,
        ),
        envContent: await readFile(env.envFile, HOOK_ENV_FILE.ENCODING),
      });
    },
  );
}

async function absentPiTranscriptPath(): Promise<undefined> {
  return undefined;
}

async function untrustedPiTranscriptPath(env: PiTranscriptFixtureEnv, sessionId: string): Promise<string> {
  const fileName = agentSessionJsonlName(sessionId);
  const outsidePath = join(env.untrustedDir, fileName);
  const transcriptPath = join(env.sessionStoreDir, fileName);
  await writeFile(
    outsidePath,
    piTranscript({
      sessionId,
      cwd: env.productDir,
      timestamp: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime()),
    }),
    AGENT_SESSION_STORE.TEXT_ENCODING,
  );
  await symlink(outsidePath, transcriptPath);
  return transcriptPath;
}

async function unreadablePiTranscriptPath(env: PiTranscriptFixtureEnv, sessionId: string): Promise<string> {
  return join(env.sessionStoreDir, agentSessionJsonlName(sessionId));
}

async function malformedPiTranscriptPath(env: PiTranscriptFixtureEnv, sessionId: string): Promise<string> {
  const transcriptPath = join(env.sessionStoreDir, agentSessionJsonlName(sessionId));
  await writeFile(
    transcriptPath,
    JSON.stringify(samplePathUnsafeAgentSessionIdentity()),
    AGENT_SESSION_STORE.TEXT_ENCODING,
  );
  return transcriptPath;
}

async function mismatchedPiTranscriptPath(env: PiTranscriptFixtureEnv, sessionId: string): Promise<string> {
  const transcriptPath = join(env.sessionStoreDir, agentSessionJsonlName(sessionId));
  await writeFile(
    transcriptPath,
    piTranscript({
      sessionId,
      cwd: join(env.productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName())),
      timestamp: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime()),
    }),
    AGENT_SESSION_STORE.TEXT_ENCODING,
  );
  return transcriptPath;
}

const PI_SESSION_START_REJECTION_SETUPS: Readonly<Record<PiSessionStartRejectionKind, PiTranscriptFixtureSetup>> = {
  pathRequired: absentPiTranscriptPath,
  pathUntrusted: untrustedPiTranscriptPath,
  readFailed: unreadablePiTranscriptPath,
  headerInvalid: malformedPiTranscriptPath,
  productMismatch: mismatchedPiTranscriptPath,
};

export async function withPiSessionStartRejectionMappingEvidence(
  rejectionKind: PiSessionStartRejectionKind,
  callback: (evidence: PiSessionStartRejectionMappingEvidence) => void | Promise<void>,
): Promise<void> {
  await withPiSessionStartRejectionEvidence(
    PI_SESSION_START_REJECTION_SETUPS[rejectionKind],
    async (evidence) => callback({ ...evidence, rejectionKind }),
  );
}

export async function withPiSessionStartCliRejectionMappingEvidence(
  rejectionKind: PiSessionStartRejectionKind,
  callback: (evidence: PiSessionStartCliRejectionMappingEvidence) => void | Promise<void>,
): Promise<void> {
  await withPiSessionStartCliRejectionEvidence(
    PI_SESSION_START_REJECTION_SETUPS[rejectionKind],
    async (evidence) => callback({ ...evidence, rejectionKind }),
  );
}

export async function withUntrustedPiTranscriptPathEvidence(
  callback: (evidence: PiSessionStartRejectionEvidence) => void | Promise<void>,
): Promise<void> {
  await withPiSessionStartRejectionEvidence(untrustedPiTranscriptPath, callback);
}

function orderedDistinctTimestamps(): readonly [string, string] {
  const [first, second] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
  return Date.parse(first) < Date.parse(second) ? [first, second] : [second, first];
}
