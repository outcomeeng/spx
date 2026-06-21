import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SessionWorkBranchNotOnOriginError } from "@/domains/session/errors";
import {
  HANDOFF_BASE_FACT_LABEL,
  HANDOFF_BASE_MARK,
  HANDOFF_BASE_PREREQUISITE_LABEL,
  HANDOFF_BASE_UNRESOLVED,
  SESSION_HANDOFF_BASE_ERROR_NAME,
} from "@/domains/session/handoff-base-checklist";
import { FIELD_SELECTION_SEPARATOR, parseSessionMetadata, SESSION_RECORD_FIELD } from "@/domains/session/list";
import { SESSION_PRIORITY, SESSION_STATUSES, type SessionStatus } from "@/domains/session/types";
import { GIT_HEAD_SHA_ARGS, NOT_GIT_REPO_WARNING } from "@/git/root";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  arbitraryBarePoolLayoutCase,
  arbitraryBarePoolWithoutMainCheckoutLayoutCase,
  arbitraryBarePoolWithoutOriginLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import {
  arbitraryHandoffHeader,
  sampleDistinctSessionIds,
  sampleSessionContent,
  sampleSessionId,
} from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_REF, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { type GitWorktreeEnv, withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  ABSENT_SESSION_ID,
  buildHandoffStdin,
  buildSessionMarkdownBody,
  createNonGitSessionEnv,
  createSessionHarness,
  HANDOFF_ID_TAG_PATTERN,
  runSessionCli,
  SESSION_CLI_ANSI_ESCAPE,
  SESSION_FILE_TAG_PATTERN,
  SESSION_FIXTURE_COMMIT_MESSAGE,
  type SessionHarness,
  withCommittedGitCwd,
} from "@testing/harnesses/session/harness";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

/** A worktree-local branch and the linked worktree path the refusal wiring smoke provisions. */
const LINKED_WORKTREE_BRANCH = "feature/linked-local";
const LINKED_WORKTREE_RELATIVE_PATH = ".worktrees/linked";
/** The default branch the permitted-base smoke points `origin/HEAD` at. */
const FIXTURE_DEFAULT_BRANCH = "main";
/** The work-hiding remedy the refusal diagnostic must never surface at the CLI boundary. */
const FORBIDDEN_STASH_REMEDY = "git stash";
/** The fabricated placeholder an unresolved base must never render as at the CLI boundary. */
const FORBIDDEN_ORIGIN_PLACEHOLDER = "origin/<default>";

/** The rendered fact line for `label`, anchored to its label prefix so the header prose never matches. */
function factLine(stderr: string, label: string): string {
  const prefix = `${label}: `;
  const line = stderr.split("\n").find((candidate) => candidate.trimStart().startsWith(prefix));
  // Name the absent label on failure rather than letting an empty fallback surface as a bare
  // "expected '' to contain …"; the assertion fires only when the fact line is missing.
  expect(line, `expected a fact line for "${label}"`).toBeDefined();
  return line ?? "";
}

/** The rendered prerequisite line containing `label` (mark then label), asserted present so an absent line names the gap. */
function prerequisiteLine(stderr: string, label: string): string {
  const line = stderr.split("\n").find((candidate) => candidate.includes(label));
  expect(line, `expected a prerequisite line for "${label}"`).toBeDefined();
  return line ?? "";
}

/**
 * Seeds a commit and points `origin/HEAD` at `origin/<FIXTURE_DEFAULT_BRANCH>` = the seed commit,
 * so the handler's default-branch and origin-tip collection resolve to real values. Returns the
 * resolved tip SHA. Shared by the permitted (detached-at-tip) and refused (on-branch) origin smokes.
 */
async function seedResolvedOrigin(gitEnv: GitWorktreeEnv): Promise<string> {
  await gitEnv.runGit([
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    SESSION_FIXTURE_COMMIT_MESSAGE,
  ]);
  const tipSha = await gitEnv.runGit([...GIT_HEAD_SHA_ARGS]);
  const originDefaultRef = `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${FIXTURE_DEFAULT_BRANCH}`;
  await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.UPDATE_REF, originDefaultRef, tipSha]);
  await gitEnv.runGit([
    GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF,
    `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${GIT_TEST_REF.HEAD_NAME}`,
    originDefaultRef,
  ]);
  return tipSha;
}

/**
 * Seeds a commit and adds a linked worktree checked out on a named branch — a non-main checkout
 * the handoff-base gate refuses. Returns the linked worktree path. Shared by the refused smokes
 * that differ only in working-tree cleanliness.
 */
async function addLinkedWorktreeOnBranch(gitEnv: GitWorktreeEnv): Promise<string> {
  await gitEnv.runGit([
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    SESSION_FIXTURE_COMMIT_MESSAGE,
  ]);
  await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, LINKED_WORKTREE_BRANCH]);
  const linkedWorktreeDir = join(gitEnv.productDir, LINKED_WORKTREE_RELATIVE_PATH);
  await gitEnv.runGit([
    GIT_TEST_SUBCOMMANDS.WORKTREE,
    GIT_TEST_SUBCOMMANDS.ADD,
    linkedWorktreeDir,
    LINKED_WORKTREE_BRANCH,
  ]);
  return linkedWorktreeDir;
}

/**
 * The two bare-pool layouts whose main-checkout path resolves to nothing: one with no `origin`
 * remote (no repository name to designate a worktree), and one whose `origin` names a repository
 * but whose named worktree is absent. Both must render the main-checkout fact line unresolved.
 */
const UNRESOLVED_BARE_POOL_CASES: ReadonlyArray<{
  readonly label: string;
  readonly arbitrary: typeof arbitraryBarePoolWithoutOriginLayoutCase;
}> = [
  { label: "no origin remote", arbitrary: arbitraryBarePoolWithoutOriginLayoutCase },
  { label: "an origin name no worktree bears", arbitrary: arbitraryBarePoolWithoutMainCheckoutLayoutCase },
];

describe("session CLI compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: variadic commands process IDs after a failed ID", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);

    const result = await runSessionCli([
      "session",
      "delete",
      ABSENT_SESSION_ID,
      validId,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(ABSENT_SESSION_ID);
    expect(result.stderr).toContain(validId);
    expect(existsSync(join(harness.statusDir(TODO), `${validId}.md`))).toBe(false);
  });

  it("ALWAYS: partial failure exits non-zero while preserving successful work", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);

    const result = await runSessionCli([
      "session",
      "archive",
      validId,
      ABSENT_SESSION_ID,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(harness.statusDir(ARCHIVE), `${validId}.md`))).toBe(true);
  });

  it("NEVER: pickup drops IDs beyond the first", async () => {
    const ids = [...sampleDistinctSessionIds(2)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }

    const result = await runSessionCli([
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
    const validId = sampleSessionId();
    const invalidId = ABSENT_SESSION_ID;
    await harness.writeSession(TODO, validId);

    const result = await runSessionCli([
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
      const result = await runSessionCli(
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
      const omitsGoal = await runSessionCli(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"priority":"high","next_step":"Run validation","specs":[],"files":[]}\n# Session`,
        gitCwd,
      );

      // Stdin opening with the YAML-frontmatter delimiter — wire-format error.
      const legacyYaml = await runSessionCli(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        "---\npriority: high\ngoal: Legacy shape\nnext_step: Should reject\n---\n# Body",
        gitCwd,
      );

      // JSON header that opens with `{` but is not parseable — structural
      // wire-format error.
      const malformedJson = await runSessionCli(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"priority":"high","goal":"oops"`,
        gitCwd,
      );

      expect(omitsGoal.exitCode).toBe(1);
      expect(omitsGoal.stderr).toContain("SessionInvalidGoalError");
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);

      expect(legacyYaml.exitCode).toBe(1);
      expect(legacyYaml.stderr).toContain("SessionLegacyFrontmatterInputError");
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);

      expect(malformedJson.exitCode).toBe(1);
      expect(malformedJson.stderr).toContain("SessionInvalidJsonHeaderError");
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("ALWAYS: archive moves a session of any frontmatter shape through the CLI", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleSessionContent());

    const result = await runSessionCli([
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

describe("session CLI handoff git_ref recording", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("explicit git_ref present on origin: records the work-branch ref and exits 0", async () => {
    const workBranch = "feat/cli-explicit-ref";
    await withGitWorktreeEnv(async (gitEnv) => {
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.COMMIT,
        GIT_TEST_FLAGS.ALLOW_EMPTY,
        GIT_TEST_FLAGS.COMMIT_MESSAGE,
        SESSION_FIXTURE_COMMIT_MESSAGE,
      ]);
      const sha = await gitEnv.runGit([...GIT_HEAD_SHA_ARGS]);
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.UPDATE_REF,
        `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${workBranch}`,
        sha,
      ]);

      const result = await runSessionCli(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"goal":"Anchor at work branch","next_step":"Resume on the feature branch","git_ref":"${workBranch}"}\n# Session`,
        gitEnv.productDir,
      );

      expect(result.exitCode).toBe(0);
      const sessionFileMatch = result.stdout.match(SESSION_FILE_TAG_PATTERN);
      expect(sessionFileMatch).not.toBeNull();
      const metadata = parseSessionMetadata(await readFile(sessionFileMatch![1], "utf-8"));
      expect(metadata.git_ref).toBe(workBranch);
    });
  });

  it("explicit git_ref absent from origin: refuses naming SessionWorkBranchNotOnOriginError and writes no file", async () => {
    const workBranch = "feat/cli-missing-on-origin";
    await withCommittedGitCwd(async (cwd) => {
      const result = await runSessionCli(
        ["session", "handoff", "--sessions-dir", harness.sessionsDir],
        `{"goal":"Anchor at work branch","next_step":"Resume on the feature branch","git_ref":"${workBranch}"}\n# Session`,
        cwd,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SessionWorkBranchNotOnOriginError.name);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });
});

// Thin wiring smokes: the descriptor maps the handoff-base error to a non-zero
// exit and writes the pure formatter's checklist to stderr, and a permitted base
// writes the session with no checklist. The condition→checklist correspondence
// and the rendered format are proven purely — the decision over HandoffGitFacts in
// the session-store node's handoff-base gate tests, and the rendering over
// HandoffBaseChecklist in handoff-base-render.property.l1 — so these exercise only
// the CLI boundary, not every condition.
describe("session CLI handoff-base wiring", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  function runHandoffFrom(cwd: string): ReturnType<typeof runSessionCli> {
    return runSessionCli(
      ["session", "handoff", "--sessions-dir", harness.sessionsDir],
      buildHandoffStdin(sampleLiteralTestValue(arbitraryHandoffHeader()), buildSessionMarkdownBody("Wiring")),
      cwd,
    );
  }

  it("refused: a non-main checkout writes the rendered checklist to stderr and exits non-zero", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const linkedWorktreeDir = await addLinkedWorktreeOnBranch(gitEnv);
      // The linked worktree shares the seed commit the branch was cut from, so the main
      // checkout's HEAD SHA is the value the handler must collect for the linked worktree.
      const headSha = await gitEnv.runGit([...GIT_HEAD_SHA_ARGS]);

      const result = await runHandoffFrom(linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      // The descriptor wrote the pure formatter's checklist, not a bare message.
      expect(result.stderr).toContain(HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
      // The handler's git-to-facts collection populated the real HEAD SHA, not a stale or
      // fabricated value — the rendered HEAD fact line carries the worktree's actual commit.
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.HEAD)).toContain(headSha);
      // Every other git-collected fact also round-trips through the rendered checklist: the
      // real current-worktree and main-checkout paths (asserted as path segments to stay
      // invariant to the temp-dir realpath prefix), and — with no origin — the default branch
      // and tip stated as unresolved rather than fabricated.
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.CURRENT_WORKTREE)).toContain(
        LINKED_WORKTREE_RELATIVE_PATH,
      );
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT)).toContain(basename(gitEnv.productDir));
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH}: ${HANDOFF_BASE_UNRESOLVED}`,
      );
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP}: ${HANDOFF_BASE_UNRESOLVED}`,
      );
      // CLI-boundary invariants: the diagnostic the descriptor writes never directs the agent to
      // stash, and an unresolved base never fabricates the literal placeholder.
      expect(result.stderr).not.toContain(FORBIDDEN_STASH_REMEDY);
      expect(result.stderr).not.toContain(FORBIDDEN_ORIGIN_PLACEHOLDER);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("refused: a dirty non-main checkout marks the clean-working-tree prerequisite unmet", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const linkedWorktreeDir = await addLinkedWorktreeOnBranch(gitEnv);
      // An untracked file dirties the working tree, so the handler's git-status read sets the clean
      // fact false — the collection path the clean refused smokes leave unexercised at the boundary.
      await writeFile(join(linkedWorktreeDir, "uncommitted.txt"), "dirty");

      const result = await runHandoffFrom(linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      expect(prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE)).toContain(
        HANDOFF_BASE_MARK.UNMET,
      );
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it("permitted: a main-checkout handoff writes the session with no checklist and exits 0", async () => {
    await withCommittedGitCwd(async (cwd) => {
      const result = await runHandoffFrom(cwd);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(result.stdout).toMatch(SESSION_FILE_TAG_PATTERN);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(1);
    });
  });

  it("bare pool with a repository-named worktree: the checklist names the resolved main-checkout path", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const [nonMainName] = layout.otherNames;
      const result = await runHandoffFrom(env.worktree(nonMainName));

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      // The bare-pool main checkout is the worktree named after the origin repository,
      // asserted as a path segment to stay invariant to the temp-dir realpath prefix.
      const mainLine = factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT);
      expect(mainLine).toContain(`${sep}${layout.mainCheckoutName}`);
      expect(mainLine).not.toContain(HANDOFF_BASE_UNRESOLVED);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });

  it.each(UNRESOLVED_BARE_POOL_CASES)(
    "bare pool with $label: the checklist renders the main-checkout path unresolved",
    async ({ arbitrary }) => {
      const layout = sampleMainCheckoutTestValue(arbitrary());
      await withWorktreeLayoutEnv(layout.spec, async (env) => {
        const result = await runHandoffFrom(env.worktree(layout.nonMainCheckoutName));

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
        expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT).trim()).toBe(
          `${HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT}: ${HANDOFF_BASE_UNRESOLVED}`,
        );
        expect(await readdir(harness.statusDir(TODO))).toEqual([]);
      });
    },
  );

  it("permitted: a clean non-main worktree detached at the origin tip writes the session and no checklist", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const tipSha = await seedResolvedOrigin(gitEnv);
      const linkedWorktreeDir = join(gitEnv.productDir, LINKED_WORKTREE_RELATIVE_PATH);
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        GIT_TEST_FLAGS.DETACH,
        linkedWorktreeDir,
        tipSha,
      ]);

      const result = await runHandoffFrom(linkedWorktreeDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(result.stdout).toMatch(SESSION_FILE_TAG_PATTERN);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(1);
    });
  });

  it("refused with a resolved origin: the checklist names the real default branch and origin tip", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const tipSha = await seedResolvedOrigin(gitEnv);
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, LINKED_WORKTREE_BRANCH]);
      const linkedWorktreeDir = join(gitEnv.productDir, LINKED_WORKTREE_RELATIVE_PATH);
      // On a named branch (not detached) the at-tip prerequisite is unmet, so the base refuses
      // even though origin resolves — exercising the resolved-origin refused render the permitted
      // smoke cannot, since success emits no checklist.
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        linkedWorktreeDir,
        LINKED_WORKTREE_BRANCH,
      ]);

      const result = await runHandoffFrom(linkedWorktreeDir);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      // The default-branch and origin-tip fact lines carry the real collected values, proving the
      // git-to-facts collection of the resolved-origin facts reaches the rendered checklist.
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH}: ${FIXTURE_DEFAULT_BRANCH}`,
      );
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP)).toContain(tipSha);
      // HEAD is the seed commit the branch was cut from, so the HEAD fact line carries it too —
      // the checklist carries the observed HEAD SHA whether or not origin resolves.
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.HEAD)).toContain(tipSha);
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

        const result = await runSessionCli(args, undefined, env.cwd);

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

      const result = await runSessionCli([SESSION_DOMAIN, "handoff"], stdin, env.cwd);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).not.toContain(NOT_GIT_REPO_WARNING);
      expect(result.stderr).not.toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      expect(result.stderr.trim()).toBe("");
      expect(await readdir(env.statusDir(TODO))).toEqual([]);
    } finally {
      await env.cleanup();
    }
  });

  it("NEVER: the non-git diagnostic claims sessions will be created", async () => {
    const env = await createNonGitSessionEnv();
    try {
      const result = await runSessionCli([SESSION_DOMAIN, "list"], undefined, env.cwd);

      expect(result.stderr.trim()).not.toBe("");
      expect(result.stderr).not.toMatch(/creat/i);
    } finally {
      await env.cleanup();
    }
  });
});

describe("session CLI — JSON list output and field selection", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("ALWAYS: `session list --json` writes parseable JSON keyed by status with flat records, exit 0", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const result = await runSessionCli(["session", "list", "--json", "--sessions-dir", harness.sessionsDir]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, Array<Record<string, unknown>>>;
    expect(parsed[TODO].some((record) => record.id === id)).toBe(true);
    for (const record of parsed[TODO]) {
      expect(record).not.toHaveProperty("path");
      expect(record).not.toHaveProperty("metadata");
    }
  });

  it("ALWAYS: `session list --fields` and `session todo --fields` emit exactly the named fields, exit 0", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const selection = [
      SESSION_RECORD_FIELD.ID,
      SESSION_RECORD_FIELD.PRIORITY,
      SESSION_RECORD_FIELD.GOAL,
      SESSION_RECORD_FIELD.NEXT_STEP,
      SESSION_RECORD_FIELD.GIT_REF,
    ];
    const fieldsArg = selection.join(",");

    for (const subcommand of ["list", "todo"]) {
      const result = await runSessionCli([
        "session",
        subcommand,
        "--fields",
        fieldsArg,
        "--sessions-dir",
        harness.sessionsDir,
      ]);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as Record<string, Array<Record<string, unknown>>>;
      expect(Object.keys(parsed[TODO][0])).toEqual(selection);
    }
  });

  it("NEVER: an unknown `--fields` token yields JSON — stderr names the token and the valid set, non-zero exit", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const unknownToken = sampleSessionId();

    const result = await runSessionCli([
      "session",
      "list",
      "--fields",
      unknownToken,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).toContain(unknownToken);
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });

  it("NEVER: an empty `--fields` value yields JSON — stderr lists the valid set, non-zero exit", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const result = await runSessionCli(["session", "list", "--fields", "", "--sessions-dir", harness.sessionsDir]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });

  it("NEVER: a separators-only `--fields` value yields JSON — stderr names the token and the valid set, non-zero exit", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);

    const result = await runSessionCli([
      "session",
      "list",
      "--fields",
      FIELD_SELECTION_SEPARATOR,
      "--sessions-dir",
      harness.sessionsDir,
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).toContain(FIELD_SELECTION_SEPARATOR);
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });
});

const LIST_COLOR_FIELDS = `${SESSION_RECORD_FIELD.ID}${FIELD_SELECTION_SEPARATOR}${SESSION_RECORD_FIELD.PRIORITY}`;

/** A `spx session list`/`todo` invocation and whether its piped output should carry ANSI styling. */
interface ListColorCase {
  readonly title: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
  readonly expectColor: boolean;
}

const LIST_COLOR_CASES: readonly ListColorCase[] = [
  { title: "piped session list emits no ANSI escape (pipe-safe)", args: ["session", "list"], expectColor: false },
  { title: "piped session todo emits no ANSI escape (pipe-safe)", args: ["session", "todo"], expectColor: false },
  {
    title: "--color emits ANSI escapes even when NO_COLOR is present (flag overrides env)",
    args: ["session", "list", "--color"],
    env: { NO_COLOR: "1" },
    expectColor: true,
  },
  { title: "--no-color emits no ANSI escape", args: ["session", "list", "--no-color"], expectColor: false },
  {
    title: "the --json path emits no ANSI escape even with --color",
    args: ["session", "list", "--json", "--color"],
    expectColor: false,
  },
  {
    title: "the --fields path emits no ANSI escape even with --color",
    args: ["session", "list", "--fields", LIST_COLOR_FIELDS, "--color"],
    expectColor: false,
  },
];

describe("session CLI list color compliance", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
    await harness.writeSession(TODO, sampleSessionId(), {
      priority: SESSION_PRIORITY.HIGH,
      goal: "uplift the list output",
      next_step: "ship the formatter",
    });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it.each(LIST_COLOR_CASES)("ALWAYS: $title", async ({ args, env, expectColor }) => {
    const { stdout, exitCode } = await runSessionCli(
      [...args, "--sessions-dir", harness.sessionsDir],
      undefined,
      process.cwd(),
      env,
    );

    expect(exitCode).toBe(0);
    if (expectColor) {
      expect(stdout).toContain(SESSION_CLI_ANSI_ESCAPE);
    } else {
      expect(stdout).not.toContain(SESSION_CLI_ANSI_ESCAPE);
    }
  });
});
