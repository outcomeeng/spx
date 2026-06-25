import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPACT_MARKER } from "@/domains/compact";
import { AGENT_SESSION_ENV } from "@/domains/session/agent-session";
import { COMPACT_CLI, compactDomain } from "@/interfaces/cli/compact";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
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

function transcriptJsonl(lines: readonly string[]): string {
  return lines.map((content) => JSON.stringify({ content })).join("\n");
}

function escapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}${nodePath}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
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

  return {
    deferredExitCodes,
    immediateExitCodes,
    stdout: stdout.join(""),
  };
}

describe("compact CLI IO", () => {
  it("records retrieve exit code without immediate process exit after writing output", async () => {
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
      await writeFile(
        transcriptPath,
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(nodePath),
        ]),
      );

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
  });
});
