import { execa } from "execa";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_STATUSES, type SessionStatus } from "@/domains/session/types";
import { NOT_GIT_REPO_WARNING } from "@/git/root";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { arbitraryHandoffHeader, sampleSessionContent, sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  buildHandoffStdin,
  buildSessionMarkdownBody,
  createNonGitSessionEnv,
  createSessionHarness,
  type SessionHarness,
} from "@testing/harnesses/session/harness";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;
const CLI_ENTRY = join(process.cwd(), "bin/spx.js");
const SESSION_FILE_TAG_PATTERN = /<SESSION_FILE>(.*?)<\/SESSION_FILE>/;
const GIT_FIXTURE_COMMIT_MESSAGE = "session cli fixture";
const LINKED_WORKTREE_BRANCH = "feature/linked-local";
const LINKED_WORKTREE_RELATIVE_PATH = ".worktrees/linked";

async function runSpx(
  args: readonly string[],
  input?: string,
  cwd: string = process.cwd(),
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa("node", [CLI_ENTRY, ...args], {
    cwd,
    input,
    reject: false,
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

async function withCommittedGitCwd(callback: (cwd: string) => Promise<void>): Promise<void> {
  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      GIT_FIXTURE_COMMIT_MESSAGE,
    ]);
    await callback(gitEnv.productDir);
  });
}

describe("session CLI compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: variadic commands process IDs after a failed ID", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId);

    const result = await runSpx([
      "session",
      "delete",
      "missing-id",
      validId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("missing-id");
    expect(result.stderr).toContain(validId);
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });

  it("ALWAYS: partial failure exits non-zero while preserving successful work", async () => {
    const validId = "2026-01-10_10-00-00";
    await harness.writeSession(TODO, validId);

    const result = await runSpx([
      "session",
      "archive",
      validId,
      "missing-id",
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${validId}.md`))).toBe(true);
  });

  it("NEVER: pickup drops IDs beyond the first", async () => {
    const ids = ["2026-01-12_10-00-00", "2026-01-13_10-00-00"];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const result = await runSpx([
      "session",
      "pickup",
      ...ids,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(0);
    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(DOING), `${id}.md`))).toBe(true);
      expect(result.stdout).toContain(`<PICKUP_ID>${id}</PICKUP_ID>`);
    }
  });

  it("ALWAYS: pickup partial failure exits non-zero while preserving successful work", async () => {
    const validId = "2026-01-14_10-00-00";
    const invalidId = "missing-id";
    await harness.writeSession(TODO, validId);

    const result = await runSpx([
      "session",
      "pickup",
      validId,
      invalidId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(invalidId);
    expect(result.stderr).toContain(validId);
    expect(existsSync(join(harness.statusDir(DOING), `${validId}.md`))).toBe(true);
  });

  it("ALWAYS: handoff preserves body bytes after the JSON-prefix separator", async () => {
    const body = "  # Body with edge whitespace  \n";
    await withCommittedGitCwd(async (gitCwd) => {
      const result = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"goal":"Preserve body","next_step":"Inspect session file"}\n${body}`,
        gitCwd,
      );

      expect(result.exitCode).toBe(0);
      const sessionFileMatch = result.stdout.match(SESSION_FILE_TAG_PATTERN);
      expect(sessionFileMatch).not.toBeNull();

      const sessionFile = sessionFileMatch![1];
      const onDisk = await readFile(sessionFile, "utf-8");
      expect(onDisk.endsWith(body)).toBe(true);
    });
  });

  it("ALWAYS: frontmatter validation diagnostics include error names", async () => {
    await withCommittedGitCwd(async (gitCwd) => {
      // JSON header that omits goal — semantic-content error per
      // 76-session-cli.enabler/session-cli.md.
      const omitsGoal = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"priority":"high","next_step":"Run validation","specs":[],"files":[]}\n# Session`,
        gitCwd,
      );

      // Stdin opening with the YAML-frontmatter delimiter — wire-format error.
      const legacyYaml = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        "---\npriority: high\ngoal: Legacy shape\nnext_step: Should reject\n---\n# Body",
        gitCwd,
      );

      // JSON header that opens with `{` but is not parseable — structural
      // wire-format error.
      const malformedJson = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"priority":"high","goal":"oops"`,
        gitCwd,
      );

      expect(omitsGoal.exitCode).toBe(1);
      expect(omitsGoal.stderr).toContain("SessionInvalidGoalError");

      expect(legacyYaml.exitCode).toBe(1);
      expect(legacyYaml.stderr).toContain("SessionLegacyFrontmatterInputError");

      expect(malformedJson.exitCode).toBe(1);
      expect(malformedJson.stderr).toContain("SessionInvalidJsonHeaderError");
    });
  });

  it("ALWAYS: handoff in a linked worktree on a worktree-local branch reports SessionHandoffBaseError through the CLI", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.COMMIT,
        GIT_TEST_FLAGS.ALLOW_EMPTY,
        GIT_TEST_FLAGS.COMMIT_MESSAGE,
        GIT_FIXTURE_COMMIT_MESSAGE,
      ]);
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, LINKED_WORKTREE_BRANCH]);
      const linkedWorktreeDir = join(gitEnv.productDir, LINKED_WORKTREE_RELATIVE_PATH);
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        linkedWorktreeDir,
        LINKED_WORKTREE_BRANCH,
      ]);

      const result = await runSpx(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"goal":"Refuse a linked-worktree base","next_step":"Detach to origin default first"}\n# Session`,
        linkedWorktreeDir,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("SessionHandoffBaseError");
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("ALWAYS: archive moves a session of any frontmatter shape through the CLI", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleSessionContent());

    const result = await runSpx([
      "session",
      "archive",
      sessionId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${sessionId}.md`))).toBe(true);
  });
});

describe("session CLI non-git warning", () => {
  const SESSION_DOMAIN = "session";

  // Each config-resolving subcommand paired with the status it consumes; `seed`
  // is null when the subcommand takes no session id.
  const WARNING_CASES: readonly { readonly subcommand: string; readonly seed: SessionStatus | null }[] = [
    { subcommand: "list", seed: null },
    { subcommand: "todo", seed: null },
    { subcommand: "prune", seed: null },
    { subcommand: "show", seed: TODO },
    { subcommand: "delete", seed: TODO },
    { subcommand: "pickup", seed: TODO },
    { subcommand: "release", seed: DOING },
    { subcommand: "archive", seed: TODO },
  ];

  for (const { subcommand, seed } of WARNING_CASES) {
    it(`ALWAYS: spx session ${subcommand} surfaces the non-git diagnostic on stderr`, async () => {
      const env = await createNonGitSessionEnv();
      try {
        const id = sampleSessionId();
        if (seed !== null) {
          await env.writeSession(seed, id);
        }
        const args = seed === null
          ? [SESSION_DOMAIN, subcommand]
          : [SESSION_DOMAIN, subcommand, id];

        const result = await runSpx(args, undefined, env.cwd);

        expect(result.stderr).toContain(NOT_GIT_REPO_WARNING);
      } finally {
        await env.cleanup();
      }
    });
  }

  it("ALWAYS: handoff surfaces no non-git diagnostic — it refuses a non-git base first", async () => {
    const env = await createNonGitSessionEnv();
    try {
      const stdin = buildHandoffStdin(
        sampleLiteralTestValue(arbitraryHandoffHeader()),
        buildSessionMarkdownBody("Non-git handoff"),
      );

      const result = await runSpx([SESSION_DOMAIN, "handoff"], stdin, env.cwd);

      expect(result.stderr).not.toContain(NOT_GIT_REPO_WARNING);
      expect(result.stderr).toContain("SessionHandoffBaseError");
    } finally {
      await env.cleanup();
    }
  });

  it("NEVER: the non-git diagnostic claims sessions will be created", () => {
    expect(NOT_GIT_REPO_WARNING).not.toMatch(/creat/i);
  });
});
