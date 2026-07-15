import { execa } from "execa";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { COMPACT_MARKER, COMPACT_RECORD_FIELDS, COMPACT_STORE_PATH } from "@/domains/compact";
import { AGENT_SESSION_ENV, resolveAgentSessionId } from "@/domains/session/agent-session";
import { COMPACT_CLI, compactDomain } from "@/interfaces/cli/compact";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { STATE_STORE_DOMAIN, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

class ImmediateExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

type CliRun = {
  readonly deferredExitCodes: readonly number[];
  readonly immediateExitCodes: readonly number[];
  readonly stdout: string;
};

export async function runSpx(
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, ...args], { cwd, env, reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

export function agentSessionEnv(sessionToken: string): Readonly<Record<string, string>> {
  return { [AGENT_SESSION_ENV.CLAUDE_SESSION_ID]: sessionToken };
}

export function codexAgentSessionEnv(sessionToken: string): Readonly<Record<string, string>> {
  return {
    [AGENT_SESSION_ENV.CLAUDE_SESSION_ID]: "",
    [AGENT_SESSION_ENV.CODEX_THREAD_ID]: sessionToken,
  };
}

export function emptyAgentSessionEnv(): Readonly<Record<string, string>> {
  return {
    [AGENT_SESSION_ENV.CLAUDE_SESSION_ID]: "",
    [AGENT_SESSION_ENV.CODEX_THREAD_ID]: "",
  };
}

export function compactStashPath(productDir: string, sessionToken: string): string {
  return join(
    productDir,
    STATE_STORE_SCOPE_PATH.SPX_DIR,
    STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
    sessionToken,
    STATE_STORE_DOMAIN.COMPACT,
    COMPACT_STORE_PATH.STASH_FILE,
  );
}

export function escapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}${nodePath}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
}

export function unescapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}${nodePath}${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}`;
}

export function transcriptJsonl(lines: readonly string[]): string {
  return lines.map((content) => JSON.stringify({ content })).join("\n");
}

async function runCompactCli(args: readonly string[], productDir: string, sessionToken: string): Promise<CliRun> {
  const previousClaudeSessionId = process.env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID];
  const previousCodexThreadId = process.env[AGENT_SESSION_ENV.CODEX_THREAD_ID];
  const deferredExitCodes: number[] = [];
  const immediateExitCodes: number[] = [];
  const stdout: string[] = [];

  process.env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID] = sessionToken;
  process.env[AGENT_SESSION_ENV.CODEX_THREAD_ID] = "";

  try {
    const program = createCliProgram({
      domains: [compactDomain],
      processCwd: () => productDir,
      writeStdout: (output) => stdout.push(output),
      writeStderr: () => undefined,
      setExitCode: (exitCode) => deferredExitCodes.push(exitCode),
      exit: (exitCode) => {
        immediateExitCodes.push(exitCode);
        throw new ImmediateExit(exitCode);
      },
    });

    try {
      await program.parseAsync(args, { from: SPX_COMMANDER_PARSE_SOURCE });
    } catch (error) {
      if (!(error instanceof ImmediateExit)) throw error;
    }
  } finally {
    if (previousClaudeSessionId === undefined) {
      delete process.env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID];
    } else {
      process.env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID] = previousClaudeSessionId;
    }
    if (previousCodexThreadId === undefined) {
      delete process.env[AGENT_SESSION_ENV.CODEX_THREAD_ID];
    } else {
      process.env[AGENT_SESSION_ENV.CODEX_THREAD_ID] = previousCodexThreadId;
    }
  }

  return { deferredExitCodes, immediateExitCodes, stdout: stdout.join("") };
}

export async function assertAgentSessionEnvironmentRetrievesLatestRecord(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
  const fixtureCommitMessage = sampleCompactTestValue(COMPACT_TEST_GENERATOR.commitMessage());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      fixtureCommitMessage,
    ]);
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(firstNode)]));

    const firstStored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    expect(firstStored.exitCode).toBe(0);
    expect(firstStored.stdout).toHaveLength(0);
    expect(firstStored.stderr).toHaveLength(0);

    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]));
    const latestStored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    expect(latestStored.exitCode).toBe(0);
    expect(latestStored.stdout).toHaveLength(0);
    expect(latestStored.stderr).toHaveLength(0);

    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    expect(retrieved.exitCode).toBe(0);
    expect(retrieved.stderr).toHaveLength(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
    expect((await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString().trim().split(/\r?\n/u))
      .toHaveLength(2);
  });
}

export async function assertTranscriptWithoutFoundationStoresNothing(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([unescapedMarker(node)]));

    const stored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    expect(stored.exitCode).toBe(0);
    expect(stored.stdout).toHaveLength(0);
    expect(stored.stderr).toHaveLength(0);

    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    expect(retrieved.exitCode).toBe(1);
    expect(retrieved.stdout).toHaveLength(0);
    expect(retrieved.stderr).toHaveLength(0);
  });
}

export async function assertCodexUnsafeSessionIdentityStoresRecord(): Promise<void> {
  const unsafeSessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unsafeSessionToken());
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
  const env = codexAgentSessionEnv(unsafeSessionToken);
  const resolvedSessionToken = resolveAgentSessionId(env);
  if (resolvedSessionToken === undefined) throw new Error("unsafe Codex session token did not resolve");

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

    const stored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      env,
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      env,
    );

    expect(stored.exitCode).toBe(0);
    expect(stored.stdout).toHaveLength(0);
    expect(retrieved.exitCode).toBe(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
    expect((await readFile(compactStashPath(gitEnv.productDir, resolvedSessionToken))).toString()).toContain(node);
  });
}

export async function assertMissingCompactRecordReturnsNoOutput(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());

  await withGitWorktreeEnv(async (gitEnv) => {
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );

    expect(retrieved.exitCode).toBe(1);
    expect(retrieved.stdout).toHaveLength(0);
    expect(retrieved.stderr).toHaveLength(0);
  });
}

export async function assertExplicitSessionIdRetrievesLatestRecord(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(firstNode)]));
    expect(
      (await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.sessionIdFlag,
          sessionToken,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        emptyAgentSessionEnv(),
      )).exitCode,
    ).toBe(0);

    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]));
    expect(
      (await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.sessionIdFlag,
          sessionToken,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        emptyAgentSessionEnv(),
      )).exitCode,
    ).toBe(0);

    const retrieved = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
        COMPACT_CLI.sessionIdFlag,
        sessionToken,
      ],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );
    expect(retrieved.exitCode).toBe(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
    expect((await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString().trim().split(/\r?\n/u))
      .toHaveLength(2);
  });
}

export async function assertUnsafeExplicitSessionIdStoresRecord(): Promise<void> {
  const unsafeSessionId = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unsafeSessionToken());
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

    const stored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        unsafeSessionId,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName, COMPACT_CLI.sessionIdFlag, unsafeSessionId],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );

    expect(stored.exitCode).toBe(0);
    expect(retrieved.exitCode).toBe(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
  });
}

export async function assertEmptySessionIdUsesAgentSessionEnvironment(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

    const stored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        "",
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );

    expect(stored.exitCode).toBe(0);
    expect(retrieved.exitCode).toBe(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
    expect((await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString()).toContain(node);
  });
}

export async function assertExplicitSessionIdOverridesAgentSessionEnvironment(): Promise<void> {
  const [flagToken, envToken] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctSessionTokens());
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

    const stored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        flagToken,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      agentSessionEnv(envToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName, COMPACT_CLI.sessionIdFlag, flagToken],
      gitEnv.productDir,
      agentSessionEnv(envToken),
    );

    expect(stored.exitCode).toBe(0);
    expect(retrieved.exitCode).toBe(0);
    expect(JSON.parse(retrieved.stdout)).toEqual({
      [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
      [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
    });
    expect((await readFile(compactStashPath(gitEnv.productDir, flagToken))).toString()).toContain(node);
    await expect(readFile(compactStashPath(gitEnv.productDir, envToken))).rejects.toThrow();
  });
}

export async function assertMissingSessionIdentityFailsWithoutWriting(): Promise<void> {
  const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

    const stored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );

    expect(stored.exitCode).toBe(1);
    expect(stored.stdout).toHaveLength(0);
    expect(stored.stderr).toHaveLength(0);
    expect(retrieved.exitCode).toBe(1);
    expect(retrieved.stdout).toHaveLength(0);
    expect(retrieved.stderr).toHaveLength(0);
    await expect(readdir(join(
      gitEnv.productDir,
      STATE_STORE_SCOPE_PATH.SPX_DIR,
      STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
    ))).rejects.toThrow();
  });
}

export async function assertRetrieveDefersExitUntilStdoutDrains(): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const nodePath = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
  const fixtureCommitMessage = sampleCompactTestValue(COMPACT_TEST_GENERATOR.commitMessage());

  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      fixtureCommitMessage,
    ]);
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(nodePath)]));

    const stored = await runCompactCli(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      sessionToken,
    );
    expect([...stored.immediateExitCodes, ...stored.deferredExitCodes]).toEqual([0]);

    const retrieved = await runCompactCli(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      sessionToken,
    );
    expect(retrieved.immediateExitCodes).toHaveLength(0);
    expect(retrieved.deferredExitCodes).toEqual([0]);
    expect(retrieved.stdout).toContain(nodePath);
  });
}
