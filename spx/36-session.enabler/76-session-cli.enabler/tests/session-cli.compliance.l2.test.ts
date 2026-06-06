import { execa } from "execa";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  HANDOFF_BASE_FACT_LABEL,
  HANDOFF_BASE_MARK,
  HANDOFF_BASE_PREREQUISITE_LABEL,
  HANDOFF_BASE_REMEDY,
  HANDOFF_BASE_UNRESOLVED,
  SESSION_HANDOFF_BASE_ERROR_NAME,
} from "@/domains/session/handoff-base-checklist";
import { SESSION_STATUSES, type SessionStatus } from "@/domains/session/types";
import { GIT_HEAD_SHA_ARGS, GIT_SHOW_TOPLEVEL_ARGS, NOT_GIT_REPO_WARNING } from "@/git/root";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { arbitraryHandoffHeader, sampleSessionContent, sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_REF, GIT_TEST_SUBCOMMANDS, readGit } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  buildHandoffStdin,
  buildSessionMarkdownBody,
  createNonGitSessionEnv,
  createSessionHarness,
  type SessionHarness,
} from "@testing/harnesses/session/harness";

/** The fixture default branch `origin/HEAD` names when the origin refs are set. */
const FIXTURE_DEFAULT_BRANCH = "main";
/** Literal placeholder the diagnostic must never render in place of a resolvable ref. */
const ORIGIN_DEFAULT_PLACEHOLDER = "origin/<default>";
/** Stash remedy the diagnostic must never suggest. */
const FORBIDDEN_STASH_REMEDY = "git stash";
/** Untracked file that makes a linked worktree's working tree dirty. */
const DIRTY_FILE_NAME = "uncommitted.txt";
const DIRTY_FILE_CONTENT = "uncommitted change\n";
const HANDOFF_BASE_COMMIT_MESSAGE = "session cli handoff-base base";
const HANDOFF_BASE_TIP_COMMIT_MESSAGE = "session cli handoff-base tip";

/** Resolved git state of a linked-worktree handoff-base scenario, for assertions. */
interface LinkedHandoffBaseScenario {
  /** Absolute path of the detached linked worktree handoff runs from. */
  readonly linkedWorktreeDir: string;
  /** `git rev-parse --show-toplevel` of the linked worktree — the rendered current-worktree path. */
  readonly currentWorktreeToplevel: string;
  /** `git rev-parse --show-toplevel` of the root worktree — the rendered root-worktree path. */
  readonly rootWorktreeToplevel: string;
  /** The linked worktree's detached HEAD commit SHA. */
  readonly headSha: string;
  /** The `origin/<default>` tip commit SHA, or null when `origin/HEAD` is unset. */
  readonly originTipSha: string | null;
  /** The resolved default branch, or null when `origin/HEAD` is unset. */
  readonly defaultBranch: string | null;
}

/**
 * Builds a real-git linked-worktree handoff base and runs `callback` with its
 * resolved state. Two `--allow-empty` commits give distinct base and tip SHAs;
 * the linked worktree detaches at the tip. `origin/<default>` and `origin/HEAD`
 * are created with `update-ref`/`symbolic-ref` — the exact refs the handoff-base
 * resolution reads — so the scenario needs no remote.
 *
 * - `atTip`: `origin/<default>` points at the linked HEAD (met) or the base commit (unmet).
 * - `clean`: leaves the worktree clean, or writes an untracked file (unmet).
 * - `originResolved`: sets `origin/<default>` and `origin/HEAD`, or leaves both unset.
 * - `onBranch`: checks the linked worktree out on a named branch (HEAD not
 *   detached, so the at-tip prerequisite is unmet) rather than detaching it.
 */
async function withLinkedHandoffBase(
  opts: {
    readonly atTip: boolean;
    readonly clean: boolean;
    readonly originResolved: boolean;
    readonly onBranch?: boolean;
  },
  callback: (scenario: LinkedHandoffBaseScenario) => Promise<void>,
): Promise<void> {
  await withGitWorktreeEnv(async (gitEnv) => {
    const commit = (message: string): Promise<string> =>
      gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.COMMIT,
        GIT_TEST_FLAGS.ALLOW_EMPTY,
        GIT_TEST_FLAGS.COMMIT_MESSAGE,
        message,
      ]);

    await commit(HANDOFF_BASE_COMMIT_MESSAGE);
    const baseSha = await gitEnv.runGit([...GIT_HEAD_SHA_ARGS]);
    await commit(HANDOFF_BASE_TIP_COMMIT_MESSAGE);
    const tipSha = await gitEnv.runGit([...GIT_HEAD_SHA_ARGS]);

    const originDefaultRef = `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${FIXTURE_DEFAULT_BRANCH}`;
    const originHeadRef = `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${GIT_TEST_REF.HEAD_NAME}`;
    const originTipSha = opts.atTip ? tipSha : baseSha;
    if (opts.originResolved) {
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.UPDATE_REF, originDefaultRef, originTipSha]);
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF, originHeadRef, originDefaultRef]);
    }

    const linkedWorktreeDir = join(gitEnv.productDir, ".worktrees/linked");
    if (opts.onBranch) {
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, LINKED_WORKTREE_BRANCH, tipSha]);
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        linkedWorktreeDir,
        LINKED_WORKTREE_BRANCH,
      ]);
    } else {
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        GIT_TEST_FLAGS.DETACH,
        linkedWorktreeDir,
        tipSha,
      ]);
    }
    if (!opts.clean) {
      await writeFile(join(linkedWorktreeDir, DIRTY_FILE_NAME), DIRTY_FILE_CONTENT);
    }

    await callback({
      linkedWorktreeDir,
      currentWorktreeToplevel: await readGit(linkedWorktreeDir, [...GIT_SHOW_TOPLEVEL_ARGS]),
      rootWorktreeToplevel: await readGit(gitEnv.productDir, [...GIT_SHOW_TOPLEVEL_ARGS]),
      headSha: tipSha,
      originTipSha: opts.originResolved ? originTipSha : null,
      defaultBranch: opts.originResolved ? FIXTURE_DEFAULT_BRANCH : null,
    });
  });
}

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;
const CLI_ENTRY = join(process.cwd(), "bin/spx.js");
const SESSION_FILE_TAG_PATTERN = /<SESSION_FILE>(.*?)<\/SESSION_FILE>/;
const HANDOFF_ID_TAG_PATTERN = /<HANDOFF_ID>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}<\/HANDOFF_ID>/;
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

describe("session CLI handoff-base refusal checklist", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  async function runHandoffFrom(cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return runSpx(
      ["session", "handoff", "--sessions-dir", harness.sessionsDir],
      buildHandoffStdin(
        sampleLiteralTestValue(arbitraryHandoffHeader()),
        buildSessionMarkdownBody("Handoff base"),
      ),
      cwd,
    );
  }

  /** The checklist line carrying a prerequisite label, asserted to exist. */
  function prerequisiteLine(stderr: string, label: string): string {
    const line = stderr.split("\n").find((candidate) => candidate.includes(label));
    expect(line, `expected a checklist line for "${label}"`).toBeDefined();
    return line ?? "";
  }

  /** The resolved-fact line carrying a fact label, asserted to exist. */
  function factLine(stderr: string, label: string): string {
    const line = stderr.split("\n").find((candidate) => candidate.includes(label));
    expect(line, `expected a fact line for "${label}"`).toBeDefined();
    return line ?? "";
  }

  it("dirty at the origin tip: marks the clean prerequisite unmet with a commit remedy and the at-tip prerequisite met, never git stash", async () => {
    await withLinkedHandoffBase({ atTip: true, clean: false, originResolved: true }, async (scenario) => {
      const result = await runHandoffFrom(scenario.linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);

      const cleanLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
      expect(cleanLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(cleanLine).toContain(HANDOFF_BASE_REMEDY.COMMIT_OR_ROOT);

      const tipLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP);
      expect(tipLine).toContain(HANDOFF_BASE_MARK.MET);

      expect(result.stderr).not.toContain(FORBIDDEN_STASH_REMEDY);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("off the origin tip while clean: marks the at-tip prerequisite unmet, prints the observed and origin-tip SHAs, never the literal placeholder", async () => {
    await withLinkedHandoffBase({ atTip: false, clean: true, originResolved: true }, async (scenario) => {
      const result = await runHandoffFrom(scenario.linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);

      const cleanLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
      expect(cleanLine).toContain(HANDOFF_BASE_MARK.MET);

      const tipLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP);
      expect(tipLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(tipLine).toContain(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_ROOT);

      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.HEAD)).toContain(scenario.headSha);
      expect(scenario.originTipSha).not.toBeNull();
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP)).toContain(scenario.originTipSha ?? "");
      expect(result.stderr).not.toContain(ORIGIN_DEFAULT_PLACEHOLDER);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("clean and detached but origin/HEAD unset: states the default branch and tip unresolved with a root-worktree remedy, never a fabricated branch", async () => {
    await withLinkedHandoffBase({ atTip: true, clean: true, originResolved: false }, async (scenario) => {
      const result = await runHandoffFrom(scenario.linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);
      expect(scenario.defaultBranch).toBeNull();

      const tipLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP);
      expect(tipLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(tipLine).toContain(HANDOFF_BASE_REMEDY.ROOT_ONLY);

      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH)).toContain(HANDOFF_BASE_UNRESOLVED);
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP)).toContain(HANDOFF_BASE_UNRESOLVED);
      expect(result.stderr).not.toContain(ORIGIN_DEFAULT_PLACEHOLDER);
      expect(result.stderr).not.toContain(FIXTURE_DEFAULT_BRANCH);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("dirty and off the origin tip: marks both prerequisites unmet on their own lines and carries every resolved git value", async () => {
    await withLinkedHandoffBase({ atTip: false, clean: false, originResolved: true }, async (scenario) => {
      const result = await runHandoffFrom(scenario.linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);

      const cleanLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
      const tipLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP);
      expect(cleanLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(cleanLine).toContain(HANDOFF_BASE_REMEDY.COMMIT_OR_ROOT);
      expect(tipLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(tipLine).toContain(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_ROOT);
      expect(cleanLine).not.toBe(tipLine);

      expect(scenario.defaultBranch).not.toBeNull();
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH)).toContain(scenario.defaultBranch ?? "");
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP)).toContain(scenario.originTipSha ?? "");
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.HEAD)).toContain(scenario.headSha);
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.CURRENT_WORKTREE)).toContain(
        scenario.currentWorktreeToplevel,
      );
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.ROOT_WORKTREE)).toContain(scenario.rootWorktreeToplevel);

      expect(result.stderr).not.toContain(FORBIDDEN_STASH_REMEDY);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("permitted: a clean linked worktree detached at the origin tip writes the session and no checklist", async () => {
    await withLinkedHandoffBase({ atTip: true, clean: true, originResolved: true }, async (scenario) => {
      const result = await runHandoffFrom(scenario.linkedWorktreeDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(result.stdout).toMatch(SESSION_FILE_TAG_PATTERN);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(1);
    });
  });

  it("permitted: a root-worktree handoff writes the session and no checklist", async () => {
    await withCommittedGitCwd(async (rootCwd) => {
      const result = await runHandoffFrom(rootCwd);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(result.stdout).toMatch(SESSION_FILE_TAG_PATTERN);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(1);
    });
  });

  it("on a named branch: marks the clean prerequisite met and the at-tip prerequisite unmet with a detach remedy", async () => {
    await withLinkedHandoffBase(
      { atTip: true, clean: true, originResolved: true, onBranch: true },
      async (scenario) => {
        const result = await runHandoffFrom(scenario.linkedWorktreeDir);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);

        const cleanLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
        expect(cleanLine).toContain(HANDOFF_BASE_MARK.MET);

        const tipLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP);
        expect(tipLine).toContain(HANDOFF_BASE_MARK.UNMET);
        expect(tipLine).toContain(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_ROOT);

        expect(await readdir(harness.statusDir(TODO))).toEqual([]);
      },
    );
  });

  it("root worktree with no commit: refuses with a diagnostic naming the error, not silently and not a checklist", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const result = await runHandoffFrom(gitEnv.productDir);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.trim()).not.toBe("");
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      expect(result.stderr).not.toContain(HANDOFF_BASE_MARK.UNMET);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
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

  it("ALWAYS: handoff refuses a non-git base silently — no diagnostic, non-zero exit, no session written", async () => {
    const env = await createNonGitSessionEnv();
    try {
      const stdin = buildHandoffStdin(
        sampleLiteralTestValue(arbitraryHandoffHeader()),
        buildSessionMarkdownBody("Non-git handoff"),
      );

      const result = await runSpx([SESSION_DOMAIN, "handoff"], stdin, env.cwd);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).not.toContain(NOT_GIT_REPO_WARNING);
      expect(result.stderr).not.toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(env.statusDir(TODO))).toEqual([]);
    } finally {
      await env.cleanup();
    }
  });

  it("NEVER: the non-git diagnostic claims sessions will be created", () => {
    expect(NOT_GIT_REPO_WARNING).not.toMatch(/creat/i);
  });
});
