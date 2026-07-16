import { execa } from "execa";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

type SpxRun = Awaited<ReturnType<typeof runSpx>>;

export type CompactCliObservation = {
  readonly cliRetrieved?: CliRun;
  readonly cliStored?: CliRun;
  readonly expectedRecord?: Readonly<Record<string, unknown>>;
  readonly firstStored?: SpxRun;
  readonly latestStored?: SpxRun;
  readonly readEnvironmentStash?: () => Promise<Buffer>;
  readonly readScope?: () => Promise<readonly string[]>;
  readonly retrieved?: SpxRun;
  readonly stashLineCount?: number;
  readonly stashText?: string;
  readonly stored?: SpxRun;
};

type ObservationConsumer = (observation: CompactCliObservation) => void | Promise<void>;

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

export async function withAgentSessionLatestRecordObservation(consume: ObservationConsumer): Promise<void> {
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
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]));
    const latestStored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      firstStored,
      latestStored,
      retrieved,
      stashLineCount: (await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString().trim()
        .split(/\r?\n/u).length,
    });
  });
}

export async function withMissingFoundationStoreObservation(consume: ObservationConsumer): Promise<void> {
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
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );
    await consume({ retrieved, stored });
  });
}

export async function withCodexUnsafeIdentityObservation(consume: ObservationConsumer): Promise<void> {
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

    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      retrieved,
      stashText: (await readFile(compactStashPath(gitEnv.productDir, resolvedSessionToken))).toString(),
      stored,
    });
  });
}

export async function withMissingCompactRecordObservation(consume: ObservationConsumer): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());

  await withGitWorktreeEnv(async (gitEnv) => {
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(sessionToken),
    );

    await consume({ retrieved });
  });
}

export async function withExplicitSessionLatestRecordObservation(consume: ObservationConsumer): Promise<void> {
  const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
  const [firstNode, latestNode] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctNodePaths());
  const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, transcriptFileName);
    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(firstNode)]));
    const firstStored = await runSpx(
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
    );

    await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(latestNode)]));
    const latestStored = await runSpx(
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
    );

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
    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      firstStored,
      latestStored,
      retrieved,
      stashLineCount: (await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString().trim()
        .split(/\r?\n/u).length,
    });
  });
}

export async function withUnsafeExplicitSessionObservation(consume: ObservationConsumer): Promise<void> {
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

    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      retrieved,
      stored,
    });
  });
}

export async function withEmptySessionIdObservation(consume: ObservationConsumer): Promise<void> {
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

    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      retrieved,
      stashText: (await readFile(compactStashPath(gitEnv.productDir, sessionToken))).toString(),
      stored,
    });
  });
}

export async function withExplicitSessionOverrideObservation(consume: ObservationConsumer): Promise<void> {
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

    await consume({
      expectedRecord: {
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      },
      readEnvironmentStash: () => readFile(compactStashPath(gitEnv.productDir, envToken)),
      retrieved,
      stashText: (await readFile(compactStashPath(gitEnv.productDir, flagToken))).toString(),
      stored,
    });
  });
}

export async function withMissingSessionIdentityObservation(consume: ObservationConsumer): Promise<void> {
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

    await consume({
      readScope: () =>
        readdir(join(
          gitEnv.productDir,
          STATE_STORE_SCOPE_PATH.SPX_DIR,
          STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
        )),
      retrieved,
      stored,
    });
  });
}

export async function withRetrieveExitObservation(consume: ObservationConsumer): Promise<void> {
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
    const retrieved = await runCompactCli(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      sessionToken,
    );
    await consume({
      cliRetrieved: retrieved,
      cliStored: stored,
      expectedRecord: { [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: nodePath },
    });
  });
}
