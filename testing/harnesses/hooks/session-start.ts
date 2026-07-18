import { open, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/status";
import type { Result } from "@/config/types";
import { AGENT_SESSION_KIND, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
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
import {
  samplePathUnsafeAgentSessionIdentity,
  sampleWhitespaceAgentSessionIdentity,
  SESSION_GENERATOR_ERROR,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { piTranscript } from "@testing/harnesses/agent/pi-resume";
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

export interface PiSessionStartIdentityEvidence {
  readonly result: Result<SessionStartHookResult>;
  readonly sessionId: string;
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
}

interface DirectIdentityInput {
  readonly payloadSessionId?: string;
  readonly envOverlay: HookSessionStartEnv;
  readonly evidence: {
    readonly payloadSessionId?: string;
    readonly claudeSessionId?: string;
    readonly codexSessionId?: string;
  };
}

const nodeHookTranscriptFileSystem: HookTranscriptFileSystem = {
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
    transcriptFileSystem: nodeHookTranscriptFileSystem,
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
  callback: (evidence: SessionStartIdentityEvidence) => void | Promise<void>,
): Promise<void> {
  const payloadSessionId = samplePathUnsafeAgentSessionIdentity();
  await withDirectIdentityEvidence({ payloadSessionId, envOverlay: {}, evidence: { payloadSessionId } }, callback);
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
      const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
      const transcriptPath = join(env.container, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      await writeFile(
        transcriptPath,
        piTranscript({
          sessionId,
          cwd: env.worktreePath,
          timestamp: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime()),
        }),
        AGENT_SESSION_STORE.TEXT_ENCODING,
      );
      await callback({
        sessionId,
        result: await runSessionStartIdentityScenario(env, {
          claimRandomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
          content: JSON.stringify({
            [HOOK_SESSION_START_PAYLOAD.AGENT]: AGENT_SESSION_KIND.PI,
            [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
            [HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]: transcriptPath,
          }),
          env: { [CONTROLLING_PID_ENV]: String(env.holder.pid) },
        }),
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
      const originalEnvLine = `${HOOK_ENV_FILE.EXPORT_PREFIX}${
        sampleWorktreeTestValue(
          WORKTREE_TEST_GENERATOR.sessionId(),
        )
      }=${sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId())}\n`;
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
      const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
      const transcriptPath = join(env.worktreesDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName()));
      await writeFile(
        transcriptPath,
        piTranscript({
          sessionId,
          cwd: env.worktreePath,
          timestamp: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime()),
        }),
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
        { [CONTROLLING_PID_ENV]: String(process.pid) },
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
      });
    },
  );
}

export function normalizedSessionId(value: string | undefined): string {
  if (value === undefined) throw new Error(SESSION_GENERATOR_ERROR.EMPTY_IDENTITY_SAMPLE);
  return normalizeAgentSessionToken(value);
}
