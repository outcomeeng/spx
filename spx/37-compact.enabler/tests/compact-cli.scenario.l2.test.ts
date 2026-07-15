import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPACT_MARKER, COMPACT_RECORD_FIELDS } from "@/domains/compact";
import { resolveAgentSessionId } from "@/domains/session/agent-session";
import { COMPACT_CLI } from "@/interfaces/cli/compact";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { COMPACT_TEST_GENERATOR, sampleCompactTestValue } from "@testing/generators/compact/compact";
import {
  agentSessionEnv,
  assertExplicitSessionIdRetrievesLatestRecord,
  codexAgentSessionEnv,
  compactStashPath,
  emptyAgentSessionEnv,
  escapedMarker,
  runSpx,
  transcriptJsonl,
  unescapedMarker,
} from "@testing/harnesses/compact/cli";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("compact CLI", () => {
  it("stores and retrieves the latest record from the agent-session environment without --session-id", async () => {
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
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(firstNode),
        ]),
      );

      const firstStored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );
      expect(firstStored.exitCode).toBe(0);
      expect(firstStored.stdout).toHaveLength(0);
      expect(firstStored.stderr).toHaveLength(0);
      await writeFile(
        transcriptPath,
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(latestNode),
        ]),
      );

      const latestStored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );
      expect(latestStored.exitCode).toBe(0);
      expect(latestStored.stdout).toHaveLength(0);
      expect(latestStored.stderr).toHaveLength(0);

      const retrieved = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );
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
      await writeFile(transcriptPath, transcriptJsonl([unescapedMarker(node)]));

      const stored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );

      expect(stored.exitCode).toBe(0);
      expect(stored.stdout).toHaveLength(0);
      expect(stored.stderr).toHaveLength(0);
      const retrieved = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );
      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
      expect(retrieved.stderr).toHaveLength(0);
    });
  });

  it("stores and retrieves records when Codex provides a path-unsafe thread identity", async () => {
    const unsafeSessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.unsafeSessionToken());
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
    const env = codexAgentSessionEnv(unsafeSessionToken);
    const resolvedSessionToken = resolveAgentSessionId(env);
    if (resolvedSessionToken === undefined) throw new Error("unsafe Codex session token did not resolve");

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(
        transcriptPath,
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(node),
        ]),
      );

      const stored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.transcriptFlag,
          transcriptPath,
        ],
        gitEnv.productDir,
        env,
      );
      const retrieved = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
        ],
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
      const stash = await readFile(compactStashPath(gitEnv.productDir, resolvedSessionToken));
      expect(stash.toString()).toContain(node);
    });
  });

  it("returns no output and exits non-zero when no compact record exists", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());

    await withGitWorktreeEnv(async (gitEnv) => {
      const retrieved = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
        ],
        gitEnv.productDir,
        agentSessionEnv(sessionToken),
      );

      expect(retrieved.exitCode).toBe(1);
      expect(retrieved.stdout).toHaveLength(0);
      expect(retrieved.stderr).toHaveLength(0);
    });
  });

  it("stores and retrieves the latest record under the --session-id token without an agent-session environment", async () => {
    await assertExplicitSessionIdRetrievesLatestRecord();
  });

  it("stores and retrieves under an unsafe --session-id value", async () => {
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
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
          COMPACT_CLI.sessionIdFlag,
          unsafeSessionId,
        ],
        gitEnv.productDir,
        emptyAgentSessionEnv(),
      );

      // Store exit 0 proves the unsafe id was normalized — an un-normalized token makes composeScopeDir reject and exit 1.
      expect(stored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual({
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      });
    });
  });

  it("falls through to the agent-session environment when --session-id is empty", async () => {
    const sessionToken = sampleCompactTestValue(COMPACT_TEST_GENERATOR.sessionToken());
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
    const emptySessionId = "";

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(transcriptPath, transcriptJsonl([COMPACT_MARKER.FOUNDATION, escapedMarker(node)]));

      const stored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
          COMPACT_CLI.sessionIdFlag,
          emptySessionId,
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
      const stash = await readFile(compactStashPath(gitEnv.productDir, sessionToken));
      expect(stash.toString()).toContain(node);
    });
  });

  it("prefers the --session-id token over the agent-session environment identity", async () => {
    const [flagToken, envToken] = sampleCompactTestValue(COMPACT_TEST_GENERATOR.distinctSessionTokens());
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(
        transcriptPath,
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(node),
        ]),
      );

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
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.retrieveCommandName,
          COMPACT_CLI.sessionIdFlag,
          flagToken,
        ],
        gitEnv.productDir,
        agentSessionEnv(envToken),
      );

      expect(stored.exitCode).toBe(0);
      expect(retrieved.exitCode).toBe(0);
      expect(JSON.parse(retrieved.stdout)).toEqual({
        [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: node,
        [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
      });
      const flagStash = await readFile(compactStashPath(gitEnv.productDir, flagToken));
      expect(flagStash.toString()).toContain(node);
      await expect(readFile(compactStashPath(gitEnv.productDir, envToken))).rejects.toThrow();
    });
  });

  it("returns no output and exits non-zero when neither a --session-id nor an agent-session environment identity is available", async () => {
    const node = sampleCompactTestValue(COMPACT_TEST_GENERATOR.nodePath());
    const transcriptFileName = sampleCompactTestValue(COMPACT_TEST_GENERATOR.transcriptFileName());
    let output = "";

    await withGitWorktreeEnv(async (gitEnv) => {
      const transcriptPath = join(gitEnv.productDir, transcriptFileName);
      await writeFile(
        transcriptPath,
        transcriptJsonl([
          COMPACT_MARKER.FOUNDATION,
          escapedMarker(node),
        ]),
      );

      const stored = await runSpx(
        [
          COMPACT_CLI.commandName,
          COMPACT_CLI.storeCommandName,
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
        ],
        gitEnv.productDir,
        emptyAgentSessionEnv(),
      );

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
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
      ))).rejects.toThrow();
    });
  });
});
