import { execa } from "execa";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPACT_MARKER, COMPACT_RECORD_FIELDS, COMPACT_STORE_PATH } from "@/domains/compact";
import { AGENT_SESSION_ENV } from "@/domains/session/agent-session";
import { COMPACT_CLI } from "@/interfaces/cli/compact";
import { STATE_STORE_DOMAIN, STATE_STORE_PATH } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

async function runSpx(
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, ...args], { cwd, env, reject: false });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

function agentSessionEnv(sessionToken: string): Readonly<Record<string, string>> {
  return { [AGENT_SESSION_ENV.CLAUDE_SESSION_ID]: sessionToken };
}

function emptyAgentSessionEnv(): Readonly<Record<string, string>> {
  return {
    [AGENT_SESSION_ENV.CLAUDE_SESSION_ID]: "",
    [AGENT_SESSION_ENV.CODEX_THREAD_ID]: "",
  };
}

function compactStashPath(productDir: string, sessionToken: string): string {
  return join(
    productDir,
    STATE_STORE_PATH.SPX_DIR,
    STATE_STORE_PATH.WORKTREE_SCOPE,
    sessionToken,
    STATE_STORE_DOMAIN.COMPACT,
    COMPACT_STORE_PATH.STASH_FILE,
  );
}

function escapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${
    COMPACT_MARKER.ESCAPED_TARGET_QUOTE
  }${nodePath}${COMPACT_MARKER.ESCAPED_TARGET_QUOTE}`;
}

function unescapedMarker(nodePath: string): string {
  return `${COMPACT_MARKER.CONTEXT} ${COMPACT_MARKER.TARGET_ATTRIBUTE}=${
    COMPACT_MARKER.UNESCAPED_TARGET_QUOTE
  }${nodePath}${COMPACT_MARKER.UNESCAPED_TARGET_QUOTE}`;
}

describe("compact CLI", () => {
  it("stores transcript context and retrieves the latest compact record", async () => {
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
      await writeFile(
        transcriptPath,
        [
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(firstNode),
        ].join("\n"),
      );

      const firstStored = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));
      expect(firstStored.exitCode).toBe(0);
      expect(firstStored.stdout).toHaveLength(0);
      expect(firstStored.stderr).toHaveLength(0);
      await writeFile(
        transcriptPath,
        [
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(latestNode),
        ].join("\n"),
      );

      const latestStored = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));
      expect(latestStored.exitCode).toBe(0);
      expect(latestStored.stdout).toHaveLength(0);
      expect(latestStored.stderr).toHaveLength(0);

      const retrieved = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));
      expect(retrieved.exitCode).toBe(0);
      expect(retrieved.stderr).toHaveLength(0);
      expect(JSON.parse(retrieved.stdout)).toEqual({
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: latestNode,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      });

      const stash = await readFile(compactStashPath(gitEnv.productDir, sessionToken));
      expect(stash.toString().trim().split(/\r?\n/u)).toHaveLength(2);
    });
  });

  it("stores nothing and exits successfully when the transcript has no foundation marker", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(transcriptPath, unescapedMarker(node));

      const stored = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));

      expect(stored.exitCode).toBe(0);
      expect(stored.stdout).toHaveLength(0);
      expect(stored.stderr).toHaveLength(0);
      const retrieved = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));
      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
      expect(retrieved.stderr).toHaveLength(0);
    });
  });

  it("returns no output and exits non-zero when no compact record exists", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());

    await withGitWorktreeEnv(async (gitEnv) => {
      const retrieved = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));

      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
      expect(retrieved.stderr).toHaveLength(0);
    });
  });

  it("rejects command-line session token options for store and retrieve", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(transcriptPath, [
        COMPACT_MARKER.FOUNDATION,
        escapedMarker(node),
      ].join("\n"));

      const stored = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        "--session-id",
        sessionToken,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));
      const retrieved = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
        "--session-id",
        sessionToken,
      ], gitEnv.productDir, agentSessionEnv(sessionToken));

      expect(stored.exitCode).toBe(1);
      expect(stored.stdout).toHaveLength(0);
      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
    });
  });

  it("returns no output and exits non-zero when no agent session identity is available", async () => {
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
    let output = "";

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(transcriptPath, [
        COMPACT_MARKER.FOUNDATION,
        escapedMarker(node),
      ].join("\n"));

      const stored = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.storeCommandName,
        COMPACT_CLI.transcriptFlag,
        transcriptPath,
      ], gitEnv.productDir, emptyAgentSessionEnv());
      const retrieved = await runSpx([
        COMPACT_CLI.commandName,
        COMPACT_CLI.retrieveCommandName,
      ], gitEnv.productDir, emptyAgentSessionEnv());

      expect(stored.exitCode).toBe(1);
      expect(stored.stdout).toHaveLength(0);
      expect(stored.stderr).toHaveLength(0);
      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
      expect(retrieved.stderr).toHaveLength(0);
      output += retrieved.stdout;
      expect(output).toHaveLength(0);
      await expect(readdir(join(
        gitEnv.productDir,
        STATE_STORE_PATH.SPX_DIR,
        STATE_STORE_PATH.WORKTREE_SCOPE,
      ))).rejects.toThrow();
    });
  });
});
