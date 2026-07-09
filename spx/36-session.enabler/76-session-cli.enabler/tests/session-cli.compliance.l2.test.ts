import { SESSION_INJECTION_SECTION_PREFIX } from "@/commands/session/pickup";
import { buildSessionFrontMatterContent } from "@/domains/session/create";
import {
  SessionInvalidGoalError,
  SessionInvalidJsonHeaderError,
  SessionLegacyFrontmatterInputError,
  SessionWorkBranchNotOnOriginError,
} from "@/domains/session/errors";
import {
  HANDOFF_BASE_DIRTY_HEADER,
  HANDOFF_BASE_FACT_LABEL,
  HANDOFF_BASE_MARK,
  HANDOFF_BASE_PREREQUISITE_LABEL,
  HANDOFF_BASE_REMEDY,
  HANDOFF_BASE_UNRESOLVED,
  SESSION_HANDOFF_BASE_ERROR_NAME,
} from "@/domains/session/handoff-base-checklist";
import { FIELD_SELECTION_SEPARATOR, parseSessionMetadata, SESSION_RECORD_FIELD } from "@/domains/session/list";
import { SESSION_SHOW_LABEL } from "@/domains/session/show";
import {
  formatSessionOutputMarker,
  SESSION_FILE_ENCODING,
  SESSION_OUTPUT_MARKER,
  SESSION_PRIORITY,
  SESSION_STATUSES,
  type SessionStatus,
} from "@/domains/session/types";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { sessionDomain as sessionDomainDescriptor } from "@/interfaces/cli/session";
import {
  sessionCliDefinition,
  sessionOptionToken,
  sessionSubcommandOptions,
} from "@/interfaces/cli/session/definition";
import { GIT_HEAD_SHA_ARGS, NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import { arbitrarySourceFilePath, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  arbitraryBarePoolLayoutCase,
  arbitraryBarePoolWithoutMainCheckoutLayoutCase,
  arbitraryBarePoolWithoutOriginLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import {
  FORBIDDEN_HANDOFF_BASE_ORIGIN_PLACEHOLDER,
  FORBIDDEN_HANDOFF_BASE_STASH_REMEDY,
} from "@testing/generators/session/handoff-base";
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
  SESSION_FIXTURE_COMMIT_MESSAGE,
  SESSION_FORBIDDEN_JSON_RECORD_FIELD,
  type SessionHarness,
  withCommittedGitCwd,
} from "@testing/harnesses/session/harness";
import { extractSessionFile } from "@testing/harnesses/session/session-store";
import { ANSI_ESCAPE } from "@testing/harnesses/styled-output/ansi";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { Command } from "commander";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;
const sessionDomain = sessionCliDefinition.domain.commandName;
const sessionSubcommand = sessionCliDefinition.subcommands;
const sessionOption = sessionCliDefinition.options;
/** A worktree-local branch and the linked worktree path the refusal wiring smoke provisions. */
const linkedWorktreeBranch = "feature/linked-local";
const linkedWorktreeRelativePath = ".worktrees/linked";
/** The default branch the permitted-base smoke points `origin/HEAD` at. */
const fixtureDefaultBranch = "main";

function descriptorInvocation(): CliInvocation {
  return {
    io: {
      writeStdout: () => {},
      writeStderr: () => {},
      setExitCode: () => {},
      exit: (exitCode): never => {
        throw new Error(`unexpected descriptor exit ${exitCode}`);
      },
    },
    resolveEffectiveInvocationDir: () => "/descriptor-cwd",
    resolveProductContext: () => ({
      effectiveInvocationDir: "/descriptor-cwd",
      productDir: "/descriptor-product",
    }),
  };
}

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

function registeredSessionCommand(program: Command): Command {
  const command = program.commands.find((candidate) => candidate.name() === sessionDomain);
  expect(command).toBeDefined();
  return command as Command;
}

function registeredSubcommand(sessionCommand: Command, commandName: string): Command {
  const command = sessionCommand.commands.find((candidate) => candidate.name() === commandName);
  expect(command).toBeDefined();
  return command as Command;
}

describe("session CLI descriptor registry", () => {
  it("registers every session subcommand and option from the source-owned definition", () => {
    const program = new Command();

    sessionDomainDescriptor.register(program, descriptorInvocation());

    const sessionCommand = registeredSessionCommand(program);
    expect(sessionCommand.description()).toBe(sessionCliDefinition.domain.description);
    for (const { subcommand: definition, options } of sessionSubcommandOptions) {
      const command = registeredSubcommand(sessionCommand, definition.commandName);

      expect(command.description()).toBe(definition.description);
      if (definition.operand !== undefined) {
        expect(command.usage()).toContain(definition.operand);
      }
      expect(command.options.map((option) => option.flags)).toEqual(options.map(sessionOptionToken));
    }
  });
});

/**
 * Seeds a commit and points `origin/HEAD` at `origin/<fixtureDefaultBranch>` = the seed commit,
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
  const originDefaultRef = `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${fixtureDefaultBranch}`;
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
  await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, linkedWorktreeBranch]);
  const linkedWorktreeDir = join(gitEnv.productDir, linkedWorktreeRelativePath);
  await gitEnv.runGit([
    GIT_TEST_SUBCOMMANDS.WORKTREE,
    GIT_TEST_SUBCOMMANDS.ADD,
    linkedWorktreeDir,
    linkedWorktreeBranch,
  ]);
  return linkedWorktreeDir;
}
/**
 * The two bare-pool layouts whose main-checkout path resolves to nothing: one with no `origin`
 * remote (no repository name to designate a worktree), and one whose `origin` names a repository
 * but whose named worktree is absent. Both must render the main-checkout fact line unresolved.
 */
const unresolvedBarePoolCases: ReadonlyArray<{
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
      sessionDomain,
      sessionSubcommand.delete.commandName,
      ABSENT_SESSION_ID,
      validId,
      sessionOption.sessionsDir.flag,
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
      sessionDomain,
      sessionSubcommand.archive.commandName,
      validId,
      ABSENT_SESSION_ID,
      sessionOption.sessionsDir.flag,
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
      sessionDomain,
      sessionSubcommand.pickup.commandName,
      ...ids,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(0);
    for (const id of ids) {
      expect(existsSync(join(harness.statusDir(DOING), `${id}.md`))).toBe(true);
      expect(result.stdout).toContain(formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, id));
    }
  });
  it("ALWAYS: pickup partial failure exits non-zero while preserving successful work", async () => {
    const validId = sampleSessionId();
    const invalidId = ABSENT_SESSION_ID;
    await harness.writeSession(TODO, validId);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.pickup.commandName,
      validId,
      invalidId,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(invalidId);
    expect(result.stderr).toContain(validId);
    expect(existsSync(join(harness.statusDir(DOING), `${validId}.md`))).toBe(true);
  });
  it("ALWAYS: pickup --no-inject suppresses CLI auto-injection", async () => {
    const sessionId = sampleSessionId();
    const filePath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const fileContent = sampleSessionContent();
    const absoluteFilePath = join(harness.sessionsDir, filePath);
    await mkdir(dirname(absoluteFilePath), { recursive: true });
    await writeFile(absoluteFilePath, fileContent, SESSION_FILE_ENCODING);
    await harness.writeSession(TODO, sessionId, { files: [filePath] });

    const result = await runSessionCli(
      [
        sessionDomain,
        sessionSubcommand.pickup.commandName,
        sessionOption.noInject.flag,
        sessionId,
        sessionOption.sessionsDir.flag,
        harness.sessionsDir,
      ],
      undefined,
      harness.sessionsDir,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, sessionId));
    expect(result.stdout).not.toContain(SESSION_INJECTION_SECTION_PREFIX);
    expect(result.stdout).not.toContain(fileContent);
  });
  it("ALWAYS: handoff preserves body bytes after the JSON-prefix separator", async () => {
    const body = "  # Body with edge whitespace  \n";
    await withCommittedGitCwd(async (gitCwd) => {
      const result = await runSessionCli(
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
        `{"goal":"Preserve body","next_step":"Inspect session file"}\n${body}`,
        gitCwd,
      );
      expect(result.exitCode).toBe(0);
      const sessionFile = extractSessionFile(result.stdout);
      const onDisk = await readFile(sessionFile, SESSION_FILE_ENCODING);
      expect(onDisk.endsWith(body)).toBe(true);
    });
  });
  it("ALWAYS: frontmatter validation diagnostics include error names", async () => {
    await withCommittedGitCwd(async (gitCwd) => {
      // JSON header that omits goal — semantic-content error per
      // 76-session-cli.enabler/session-cli.md.
      const omitsGoal = await runSessionCli(
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
        `${
          JSON.stringify({
            priority: SESSION_PRIORITY.HIGH,
            next_step: sampleLiteralTestValue(arbitraryHandoffHeader()).next_step,
            specs: [],
            files: [],
          })
        }\n${buildSessionMarkdownBody("missing goal")}`,
        gitCwd,
      );
      // Stdin opening with the YAML-frontmatter delimiter — wire-format error.
      const legacyYaml = await runSessionCli(
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
        buildSessionFrontMatterContent([
          `${SESSION_RECORD_FIELD.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
          `${SESSION_RECORD_FIELD.GOAL}: ${JSON.stringify("Legacy shape")}`,
          `${SESSION_RECORD_FIELD.NEXT_STEP}: ${JSON.stringify("Should reject")}`,
        ], buildSessionMarkdownBody("legacy shape")),
        gitCwd,
      );
      // JSON header that opens with `{` but is not parseable — structural
      // wire-format error.
      const malformedJson = await runSessionCli(
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
        JSON.stringify({ priority: SESSION_PRIORITY.HIGH, goal: "oops" }).slice(0, -1),
        gitCwd,
      );
      expect(omitsGoal.exitCode).toBe(1);
      expect(omitsGoal.stderr).toContain(SessionInvalidGoalError.name);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
      expect(legacyYaml.exitCode).toBe(1);
      expect(legacyYaml.stderr).toContain(SessionLegacyFrontmatterInputError.name);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
      expect(malformedJson.exitCode).toBe(1);
      expect(malformedJson.stderr).toContain(SessionInvalidJsonHeaderError.name);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });
  it("ALWAYS: archive moves a session of any frontmatter shape through the CLI", async () => {
    const sessionId = sampleSessionId();
    await harness.writeRawSession(TODO, sessionId, sampleSessionContent());
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.archive.commandName,
      sessionId,
      sessionOption.sessionsDir.flag,
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
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
        `{"goal":"Anchor at work branch","next_step":"Resume on the feature branch","git_ref":"${workBranch}"}\n# Session`,
        gitEnv.productDir,
      );
      expect(result.exitCode).toBe(0);
      const metadata = parseSessionMetadata(await readFile(extractSessionFile(result.stdout), SESSION_FILE_ENCODING));
      expect(metadata.git_ref).toBe(workBranch);
    });
  });
  it("explicit git_ref absent from origin: refuses naming SessionWorkBranchNotOnOriginError and writes no file", async () => {
    const workBranch = "feat/cli-missing-on-origin";
    await withCommittedGitCwd(async (cwd) => {
      const result = await runSessionCli(
        [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
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
      [sessionDomain, sessionSubcommand.handoff.commandName, sessionOption.sessionsDir.flag, harness.sessionsDir],
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
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.CURRENT_WORKTREE)).toContain(linkedWorktreeRelativePath);
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT)).toContain(basename(gitEnv.productDir));
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH}: ${HANDOFF_BASE_UNRESOLVED}`,
      );
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP}: ${HANDOFF_BASE_UNRESOLVED}`,
      );
      // CLI-boundary invariants: the diagnostic the descriptor writes never directs the agent to
      // stash, and an unresolved base never fabricates the literal placeholder.
      expect(result.stderr).not.toContain(FORBIDDEN_HANDOFF_BASE_STASH_REMEDY);
      expect(result.stderr).not.toContain(FORBIDDEN_HANDOFF_BASE_ORIGIN_PLACEHOLDER);
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
      expect(result.stderr.split("\n")[0]).toBe(HANDOFF_BASE_DIRTY_HEADER);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      const dirtyLine = prerequisiteLine(result.stderr, HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE);
      expect(dirtyLine).toContain(HANDOFF_BASE_MARK.UNMET);
      expect(dirtyLine).toContain(HANDOFF_BASE_REMEDY.COMMIT_BEFORE_HANDOFF);
      expect(dirtyLine).not.toContain(HANDOFF_BASE_REMEDY.MAIN_CHECKOUT_ONLY);
      expect(dirtyLine).not.toContain(HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT);
      expect(await readdir(harness.statusDir(TODO))).toEqual([]);
    });
  });
  it("permitted: a main-checkout handoff writes the session with no checklist and exits 0", async () => {
    await withCommittedGitCwd(async (cwd) => {
      const result = await runHandoffFrom(cwd);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(extractSessionFile(result.stdout)).not.toHaveLength(0);
      expect(result.stderr.trim()).toHaveLength(0);
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
  it.each(unresolvedBarePoolCases)(
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
      const linkedWorktreeDir = join(gitEnv.productDir, linkedWorktreeRelativePath);
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        GIT_TEST_FLAGS.DETACH,
        linkedWorktreeDir,
        tipSha,
      ]);
      const result = await runHandoffFrom(linkedWorktreeDir);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(HANDOFF_ID_TAG_PATTERN);
      expect(extractSessionFile(result.stdout)).not.toHaveLength(0);
      expect(result.stderr.trim()).toHaveLength(0);
      expect(await readdir(harness.statusDir(TODO))).toHaveLength(1);
    });
  });
  it("refused with a resolved origin: the checklist names the real default branch and origin tip", async () => {
    await withGitWorktreeEnv(async (gitEnv) => {
      const tipSha = await seedResolvedOrigin(gitEnv);
      await gitEnv.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, linkedWorktreeBranch]);
      const linkedWorktreeDir = join(gitEnv.productDir, linkedWorktreeRelativePath);
      // On a named branch (not detached) the at-tip prerequisite is unmet, so the base refuses
      // even though origin resolves — exercising the resolved-origin refused render the permitted
      // smoke cannot, since success emits no checklist.
      await gitEnv.runGit([
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        linkedWorktreeDir,
        linkedWorktreeBranch,
      ]);
      const result = await runHandoffFrom(linkedWorktreeDir);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      // The default-branch and origin-tip fact lines carry the real collected values, proving the
      // git-to-facts collection of the resolved-origin facts reaches the rendered checklist.
      expect(factLine(result.stderr, HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH).trim()).toBe(
        `${HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH}: ${fixtureDefaultBranch}`,
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
  // Each config-resolving subcommand paired with the status it consumes; `seed`
  // is null when the subcommand takes no session id.
  const WARNING_CASES: readonly {
    readonly subcommand: string;
    readonly seed: SessionStatus | null;
  }[] = [
    { subcommand: sessionSubcommand.list.commandName, seed: null },
    { subcommand: sessionSubcommand.todo.commandName, seed: null },
    { subcommand: sessionSubcommand.prune.commandName, seed: null },
    { subcommand: sessionSubcommand.show.commandName, seed: TODO },
    { subcommand: sessionSubcommand.delete.commandName, seed: TODO },
    { subcommand: sessionSubcommand.pickup.commandName, seed: TODO },
    { subcommand: sessionSubcommand.release.commandName, seed: DOING },
    { subcommand: sessionSubcommand.archive.commandName, seed: TODO },
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
          ? [sessionDomain, subcommand]
          : [sessionDomain, subcommand, id];
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
      const result = await runSessionCli([sessionDomain, sessionSubcommand.handoff.commandName], stdin, env.cwd);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).not.toContain(NOT_GIT_REPO_WARNING);
      expect(result.stderr).not.toContain(SESSION_HANDOFF_BASE_ERROR_NAME);
      expect(result.stderr.trim()).toHaveLength(0);
      expect(await readdir(env.statusDir(TODO))).toEqual([]);
    } finally {
      await env.cleanup();
    }
  });
  it("NEVER: the non-git diagnostic claims sessions will be created", async () => {
    const env = await createNonGitSessionEnv();
    try {
      const result = await runSessionCli([sessionDomain, sessionSubcommand.list.commandName], undefined, env.cwd);
      expect(result.stderr.trim()).not.toHaveLength(0);
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
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, Array<Record<string, unknown>>>;
    expect(parsed[TODO].some((record) => record.id === id)).toBe(true);
    for (const record of parsed[TODO]) {
      expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.PATH);
      expect(record).not.toHaveProperty(SESSION_FORBIDDEN_JSON_RECORD_FIELD.METADATA);
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
    for (const subcommand of [sessionSubcommand.list.commandName, sessionSubcommand.todo.commandName]) {
      const result = await runSessionCli([
        sessionDomain,
        subcommand,
        sessionOption.fields.flag,
        fieldsArg,
        sessionOption.sessionsDir.flag,
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
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.fields.flag,
      unknownToken,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toHaveLength(0);
    expect(result.stderr).toContain(unknownToken);
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });
  it("NEVER: an empty `--fields` value yields JSON — stderr lists the valid set, non-zero exit", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.fields.flag,
      "",
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toHaveLength(0);
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });
  it("NEVER: a separators-only `--fields` value yields JSON — stderr names the token and the valid set, non-zero exit", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.fields.flag,
      FIELD_SELECTION_SEPARATOR,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toHaveLength(0);
    expect(result.stderr).toContain(FIELD_SELECTION_SEPARATOR);
    for (const field of Object.values(SESSION_RECORD_FIELD)) {
      expect(result.stderr).toContain(field);
    }
  });
});
describe("session CLI — JSON show output", () => {
  let harness: SessionHarness;
  beforeEach(async () => {
    harness = await createSessionHarness();
  });
  afterEach(async () => {
    await harness.cleanup();
  });
  // The CLI boundary smoke for record shape: every emitted key is a declared
  // session-record field, so no `path`, no `metadata`, and no session body leak
  // into the JSON. The domain l1 tests own the exact-key contract; this asserts
  // the boundary carries nothing outside the source-owned record vocabulary.
  const recordFieldNames = Object.values(SESSION_RECORD_FIELD) as readonly string[];
  const expectOnlyRecordKeys = (record: Record<string, unknown>): void => {
    expect(Object.keys(record).every((key) => recordFieldNames.includes(key))).toBe(true);
  };
  it("ALWAYS: `session show <id> --json` writes a bare flat record, exit 0", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.show.commandName,
      id,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed[SESSION_RECORD_FIELD.ID]).toBe(id);
    expect(parsed[SESSION_RECORD_FIELD.STATUS]).toBe(TODO);
    expectOnlyRecordKeys(parsed);
  });
  it("ALWAYS: `session show <id...> --json` writes a JSON array of records in supplied order, exit 0", async () => {
    const ids = [...sampleDistinctSessionIds(3)];
    for (const id of ids) {
      await harness.writeSession(TODO, id);
    }
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.show.commandName,
      ...ids,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(parsed.map((record) => record[SESSION_RECORD_FIELD.ID])).toEqual(ids);
    for (const record of parsed) {
      expectOnlyRecordKeys(record);
    }
  });
  it("ALWAYS: `session show` without --json leaves the text header and body output unchanged", async () => {
    const id = sampleSessionId();
    await harness.writeSession(TODO, id);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.show.commandName,
      id,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${SESSION_SHOW_LABEL.STATUS}: ${TODO}`);
    expect(() => JSON.parse(result.stdout)).toThrow();
  });
  it("ALWAYS: `session show <absent> --json` writes the not-found diagnostic to stderr, no stdout JSON, non-zero exit", async () => {
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.show.commandName,
      ABSENT_SESSION_ID,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(ABSENT_SESSION_ID);
    expect(result.stdout.trim()).toHaveLength(0);
  });
  it("ALWAYS: `session show <valid> <absent> --json` processes both, names the absent id on stderr, non-zero exit", async () => {
    const validId = sampleSessionId();
    await harness.writeSession(TODO, validId);
    const result = await runSessionCli([
      sessionDomain,
      sessionSubcommand.show.commandName,
      validId,
      ABSENT_SESSION_ID,
      sessionOption.json.flag,
      sessionOption.sessionsDir.flag,
      harness.sessionsDir,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(ABSENT_SESSION_ID);
    expect(result.stdout.trim()).toHaveLength(0);
  });
});
const listColorFields = `${SESSION_RECORD_FIELD.ID}${FIELD_SELECTION_SEPARATOR}${SESSION_RECORD_FIELD.PRIORITY}`;
/** A session list-like invocation and whether its piped output should carry ANSI styling. */
interface ListColorCase {
  readonly title: string;
  readonly args: readonly string[];
  readonly env?: Record<string, string>;
  readonly expectColor: boolean;
}
const listColorCases: readonly ListColorCase[] = [
  {
    title: "piped session list emits no ANSI escape (pipe-safe)",
    args: [sessionDomain, sessionSubcommand.list.commandName],
    expectColor: false,
  },
  {
    title: "piped session todo emits no ANSI escape (pipe-safe)",
    args: [sessionDomain, sessionSubcommand.todo.commandName],
    expectColor: false,
  },
  {
    title: "--color emits ANSI escapes even when NO_COLOR is present (flag overrides env)",
    args: [sessionDomain, sessionSubcommand.list.commandName, sessionOption.color.flag],
    env: { NO_COLOR: "1" },
    expectColor: true,
  },
  {
    title: "--no-color emits no ANSI escape",
    args: [sessionDomain, sessionSubcommand.list.commandName, sessionOption.noColor.flag],
    expectColor: false,
  },
  {
    title: "the --json path emits no ANSI escape even with --color",
    args: [sessionDomain, sessionSubcommand.list.commandName, sessionOption.json.flag, sessionOption.color.flag],
    expectColor: false,
  },
  {
    title: "the --fields path emits no ANSI escape even with --color",
    args: [
      sessionDomain,
      sessionSubcommand.list.commandName,
      sessionOption.fields.flag,
      listColorFields,
      sessionOption.color.flag,
    ],
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
  it.each(listColorCases)("ALWAYS: $title", async ({ args, env, expectColor }) => {
    const { stdout, exitCode } = await runSessionCli(
      [...args, sessionOption.sessionsDir.flag, harness.sessionsDir],
      undefined,
      process.cwd(),
      env,
    );
    expect(exitCode).toBe(0);
    if (expectColor) {
      expect(stdout).toContain(ANSI_ESCAPE);
    } else {
      expect(stdout).not.toContain(ANSI_ESCAPE);
    }
  });
});
