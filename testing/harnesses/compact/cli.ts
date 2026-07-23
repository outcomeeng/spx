import { execa } from "execa";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AGENT_SESSION_ENV, resolveAgentSessionId } from "@/domains/session/agent-session";
import { COMPACT_CLI, compactDomain } from "@/interfaces/cli/compact";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
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

type ObservationConsumer<T> = (observation: T) => void | Promise<void>;

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

export async function withAgentSessionLatestRecordObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly firstStored: SpxRun;
    readonly latestStored: SpxRun;
    readonly retrieved: SpxRun;
    readonly stashLineCount: number;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.latestRecordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      scenario.commitMessage,
    ]);
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.firstTranscript);

    const firstStored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );
    await writeFile(transcriptPath, scenario.latestTranscript);
    const latestStored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );
    await consume({
      expectedRecord: scenario.expectedRecord,
      firstStored,
      latestStored,
      retrieved,
      stashLineCount: (await readFile(
        COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, scenario.sessionToken),
      )).toString().trim()
        .split(/\r?\n/u).length,
    });
  });
}

export async function withMissingFoundationStoreObservation(
  consume: ObservationConsumer<{ readonly retrieved: SpxRun; readonly stored: SpxRun }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.missingFoundationStoreScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

    const stored = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.storeCommandName, COMPACT_CLI.transcriptFlag, transcriptPath],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );
    await consume({ retrieved, stored });
  });
}

export async function withCodexUnsafeIdentityObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly retrieved: SpxRun;
    readonly stashText: string;
    readonly stored: SpxRun;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unsafeRecordScenario());
  const env = codexAgentSessionEnv(scenario.sessionToken);
  const resolvedSessionToken = resolveAgentSessionId(env);
  if (resolvedSessionToken === undefined) throw new Error("unsafe Codex session token did not resolve");

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

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
      expectedRecord: scenario.expectedRecord,
      retrieved,
      stashText: (await readFile(
        COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, resolvedSessionToken),
      )).toString(),
      stored,
    });
  });
}

export async function withMissingCompactRecordObservation(
  consume: ObservationConsumer<{ readonly retrieved: SpxRun }>,
): Promise<void> {
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

export async function withExplicitSessionLatestRecordObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly firstStored: SpxRun;
    readonly latestStored: SpxRun;
    readonly retrieved: SpxRun;
    readonly stashLineCount: number;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.latestRecordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.firstTranscript);
    const firstStored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        scenario.sessionToken,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );

    await writeFile(transcriptPath, scenario.latestTranscript);
    const latestStored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        scenario.sessionToken,
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
        scenario.sessionToken,
      ],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );
    await consume({
      expectedRecord: scenario.expectedRecord,
      firstStored,
      latestStored,
      retrieved,
      stashLineCount: (await readFile(
        COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, scenario.sessionToken),
      )).toString().trim()
        .split(/\r?\n/u).length,
    });
  });
}

export async function withUnsafeExplicitSessionObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly retrieved: SpxRun;
    readonly stored: SpxRun;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unsafeRecordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

    const stored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        scenario.sessionToken,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName, COMPACT_CLI.sessionIdFlag, scenario.sessionToken],
      gitEnv.productDir,
      emptyAgentSessionEnv(),
    );

    await consume({
      expectedRecord: scenario.expectedRecord,
      retrieved,
      stored,
    });
  });
}

export async function withEmptySessionIdObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly retrieved: SpxRun;
    readonly stashText: string;
    readonly stored: SpxRun;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.recordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

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
      agentSessionEnv(scenario.sessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      agentSessionEnv(scenario.sessionToken),
    );

    await consume({
      expectedRecord: scenario.expectedRecord,
      retrieved,
      stashText: (await readFile(
        COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, scenario.sessionToken),
      )).toString(),
      stored,
    });
  });
}

export async function withExplicitSessionOverrideObservation(
  consume: ObservationConsumer<{
    readonly expectedRecord: Readonly<Record<string, unknown>>;
    readonly readEnvironmentStash: () => Promise<Buffer>;
    readonly retrieved: SpxRun;
    readonly stashText: string;
    readonly stored: SpxRun;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.overrideScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

    const stored = await runSpx(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.sessionIdFlag,
        scenario.sessionToken,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      agentSessionEnv(scenario.environmentSessionToken),
    );
    const retrieved = await runSpx(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName, COMPACT_CLI.sessionIdFlag, scenario.sessionToken],
      gitEnv.productDir,
      agentSessionEnv(scenario.environmentSessionToken),
    );

    await consume({
      expectedRecord: scenario.expectedRecord,
      readEnvironmentStash: () =>
        readFile(COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, scenario.environmentSessionToken)),
      retrieved,
      stashText: (await readFile(
        COMPACT_TEST_GENERATOR.compactStashFilePath(gitEnv.productDir, scenario.sessionToken),
      )).toString(),
      stored,
    });
  });
}

export async function withMissingSessionIdentityObservation(
  consume: ObservationConsumer<{
    readonly readScope: () => Promise<readonly string[]>;
    readonly retrieved: SpxRun;
    readonly stored: SpxRun;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.recordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.transcript);

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

export async function withRetrieveExitObservation(
  consume: ObservationConsumer<{
    readonly cliRetrieved: CliRun;
    readonly cliStored: CliRun;
    readonly expectedRecord: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const scenario = sampleCompactTestValue(COMPACT_TEST_GENERATOR.latestRecordScenario());

  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      scenario.commitMessage,
    ]);
    const transcriptPath = join(gitEnv.productDir, scenario.transcriptFileName);
    await writeFile(transcriptPath, scenario.latestTranscript);

    const stored = await runCompactCli(
      [
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ],
      gitEnv.productDir,
      scenario.sessionToken,
    );
    const retrieved = await runCompactCli(
      [COMPACT_CLI.commandName, COMPACT_CLI.retrieveCommandName],
      gitEnv.productDir,
      scenario.sessionToken,
    );
    await consume({
      cliRetrieved: retrieved,
      cliStored: stored,
      expectedRecord: scenario.expectedRecord,
    });
  });
}
