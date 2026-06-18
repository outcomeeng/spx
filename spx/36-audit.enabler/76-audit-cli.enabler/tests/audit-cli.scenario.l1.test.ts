import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { execa } from "execa";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  AUDIT_LIFECYCLE_TEXT_LABEL,
  AUDIT_PROGRESS_STEP,
  auditCloseCommand,
  auditInitCommand,
  auditProgressCommand,
} from "@/commands/audit/lifecycle";
import { readAuditBranchRuns, readAuditRunEvents, type AuditRunStateFileSystem } from "@/commands/audit/run-state";
import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import type { PathFilterConfig } from "@/config/primitives/path-filter";
import { AUDIT_CONFIG_FIELDS, AUDIT_SECTION } from "@/domains/audit/config";
import {
  AUDIT_RUN_EVENT,
  AUDIT_RUN_STATE_FIELDS,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  AUDIT_RUN_STATE_DISPLAY,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_STATUS,
  slugAuditBranchIdentity,
} from "@/domains/audit/run-state";
import { AUDIT_CLI, AUDIT_CLI_FLAG } from "@/interfaces/cli/audit";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import { createJournal } from "@/lib/agent-run-journal";
import { appendableJournalSealMarkerPath, createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { ELLIPSIS_TOKEN, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  STATE_STORE_DOMAIN,
  STATE_STORE_PATH,
  STATE_STORE_TEXT_ENCODING,
} from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { auditBranchRunsDir, createAuditHarness, writeAuditConfig } from "@testing/harnesses/audit/harness";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const auditor = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const target = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const branch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
const headSha = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.headSha());
const baseRef = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const configBaseRef = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const configAuditor = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const configTargetInclude = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const configTargetExclude = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const linkedWorktreeBranch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
const linkedWorktreeDirectory = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const runFileLabel = AUDIT_LIFECYCLE_TEXT_LABEL.RUN_FILE;
const invalidCloseStatusValue = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.unknownProgressStep());
const millisecondsPerSecond = 10 ** 3;
const auditLifecycleTimeoutMs = 60 * millisecondsPerSecond;
const singleIncompleteRunCountText = "incomplete runs: 1";

describe("audit CLI lifecycle commands", () => {
  it("registers the audit command group through the root CLI registry", () => {
    const auditDomain = CLI_DOMAINS.find((domain) => domain.name === AUDIT_CLI.commandName);
    expect(auditDomain).toBeDefined();
    if (auditDomain === undefined) throw new Error("audit domain missing");

    const program = new Command();
    auditDomain.register(program);
    const auditCommand = program.commands.find((command) => command.name() === AUDIT_CLI.commandName);

    expect(auditCommand).toBeDefined();
    expect(auditCommand?.commands.map((command) => command.name())).toEqual([
      AUDIT_CLI.initCommandName,
      AUDIT_CLI.progressCommandName,
      AUDIT_CLI.closeCommandName,
      AUDIT_CLI.statusCommandName,
      AUDIT_CLI.listCommandName,
    ]);
  });

  it("initialize, report progress, close, and read status for one auditor lifecycle", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: baseRef,
        auditors: [auditor],
        include: [target],
      });
      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly branchName: string;
        readonly branchSlug: string;
        readonly runFilePath: string;
        readonly startedAt: string;
      };
      const runFile = initPayload.runFilePath;
      expect(initPayload.branchName).toBe(branch);
      expect(initPayload.branchSlug).toBe(slugAuditBranchIdentity(branch));
      expect(runFile).toContain(initPayload.startedAt);

      const invalidCloseStatusResult = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFile,
        AUDIT_CLI_FLAG.STATUS,
        invalidCloseStatusValue,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(invalidCloseStatusResult.exitCode).toBe(1);
      expect((JSON.parse(invalidCloseStatusResult.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.UNKNOWN_CLOSE_STATUS,
      );
      expect(invalidCloseStatusResult.errorOutput).not.toContain(invalidCloseStatusValue);

      const directInvalidCloseStatus = await auditCloseCommand({
        runFile,
        status: invalidCloseStatusValue,
        json: true,
      });
      expect(directInvalidCloseStatus.exitCode).toBe(1);
      expect((JSON.parse(directInvalidCloseStatus.output) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.UNKNOWN_CLOSE_STATUS,
      );

      for (const step of [
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_PROGRESS_STEP.DIFF_ANALYZED,
        AUDIT_PROGRESS_STEP.ADDITIONAL_FILE_INSPECTED,
        AUDIT_PROGRESS_STEP.VERDICT_CREATED,
        AUDIT_PROGRESS_STEP.FILES_PASSED_FORMAT_CHECK,
        AUDIT_PROGRESS_STEP.DONE,
      ]) {
        const progress = await runSpxAudit([
          AUDIT_CLI.progressCommandName,
          AUDIT_CLI_FLAG.RUN_FILE,
          runFile,
          AUDIT_CLI_FLAG.STEP,
          step,
          AUDIT_CLI_FLAG.MESSAGE,
          step,
        ], harness.productDir);
        expect(progress.exitCode).toBe(0);
      }

      const close = await runSpxAudit([
        AUDIT_CLI.closeAlias,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFile,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
      ], harness.productDir);
      expect(close.exitCode).toBe(0);

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(status.exitCode).toBe(0);
      const statusPayload = JSON.parse(status.output) as {
        readonly latest: { readonly state: { readonly status: string; readonly auditors: readonly string[] } };
        readonly terminalRuns: readonly unknown[];
        readonly incompleteRuns: readonly unknown[];
      };
      expect(statusPayload.latest.state.status).toBe(AUDIT_RUN_STATE_STATUS.APPROVED);
      expect(statusPayload.latest.state.auditors).toEqual([auditor]);
      expect(statusPayload.terminalRuns).toHaveLength(1);
      expect(statusPayload.incompleteRuns).toHaveLength(0);

      const list = await runSpxAudit([AUDIT_CLI.listCommandName, AUDIT_CLI_FLAG.BRANCH, branch], harness.productDir);
      expect(list.exitCode).toBe(0);
      expect(list.output).toContain(`audit list: ${AUDIT_RUN_STATE_DISPLAY[AUDIT_RUN_STATE_STATUS.APPROVED]}`);

      const events = await createAppendableJournalStore({ runFilePath: runFile }).readAll();
      expect(events[0]?.time).toBe(initPayload.startedAt);
      expect(events.map((event) => event.type)).toEqual([
        AUDIT_RUN_EVENT.STARTED_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.PROGRESS_TYPE,
        AUDIT_RUN_EVENT.COMPLETED_TYPE,
      ]);
    } finally {
      await harness.cleanup();
    }
  }, auditLifecycleTimeoutMs);

  it("uses detached HEAD identity when no branch name is available", async () => {
    const harness = await createAuditHarness();
    try {
      await runGit(harness.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.EMAIL_KEY,
        GIT_TEST_CONFIG.EMAIL,
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.USER_NAME_KEY,
        GIT_TEST_CONFIG.USER_NAME,
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.COMMIT,
        GIT_TEST_FLAGS.ALLOW_EMPTY,
        GIT_TEST_FLAGS.COMMIT_MESSAGE,
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.CHECKOUT,
        GIT_TEST_FLAGS.DETACH,
        GIT_TEST_REF.HEAD_NAME,
      ]);
      const headSha = await readGit(harness.productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_REF.HEAD_NAME]);
      await writeAuditConfig(harness.productDir, {
        baseRef: baseRef,
        auditors: [auditor],
        include: [target],
      });

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly branchName: string;
        readonly branchSlug: string;
        readonly runFilePath: string;
      };
      expect(initPayload.branchName).toBe(`detached-${headSha.slice(0, 12)}`);

      const close = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        initPayload.runFilePath,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
      ], harness.productDir);
      expect(close.exitCode).toBe(0);

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(status.exitCode).toBe(0);
      const statusPayload = JSON.parse(status.output) as {
        readonly branchName: string;
        readonly branchSlug: string;
        readonly terminalRuns: readonly unknown[];
      };
      expect(statusPayload.branchName).toBe(initPayload.branchName);
      expect(statusPayload.branchSlug).toBe(initPayload.branchSlug);
      expect(statusPayload.terminalRuns).toHaveLength(1);
    } finally {
      await harness.cleanup();
    }
  });

  it("resolves base ref, auditors, and target filter from audit config when CLI overrides are absent", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: configBaseRef,
        auditors: [configAuditor],
        include: [configTargetInclude],
        exclude: [configTargetExclude],
      });

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly baseRef: string;
        readonly auditors: readonly string[];
        readonly targets: PathFilterConfig;
      };
      expect(initPayload.baseRef).toBe(configBaseRef);
      expect(initPayload.auditors).toEqual([configAuditor]);
      expect(initPayload.targets).toEqual({ include: [configTargetInclude], exclude: [configTargetExclude] });
    } finally {
      await harness.cleanup();
    }
  });

  it("reads audit config from the current worktree while writing run state under the shared branch scope", async () => {
    const harness = await createAuditHarness();
    const linkedParentDir = await createTempDir("spx-audit-linked-parent-");
    const linkedProductDir = join(linkedParentDir, linkedWorktreeDirectory);
    try {
      await runGit(harness.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.EMAIL_KEY,
        GIT_TEST_CONFIG.EMAIL,
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.CONFIG,
        GIT_TEST_CONFIG.USER_NAME_KEY,
        GIT_TEST_CONFIG.USER_NAME,
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.COMMIT,
        GIT_TEST_FLAGS.ALLOW_EMPTY,
        GIT_TEST_FLAGS.COMMIT_MESSAGE,
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        GIT_TEST_FLAGS.NEW_BRANCH,
        linkedWorktreeBranch,
        linkedProductDir,
      ]);
      await writeInvalidAuditConfig(harness.productDir);
      await writeAuditConfig(linkedProductDir, {
        baseRef: configBaseRef,
        auditors: [configAuditor],
      });

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
        AUDIT_CLI_FLAG.JSON,
      ], linkedProductDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly baseRef: string;
        readonly auditors: readonly string[];
        readonly runFilePath: string;
      };
      expect(initPayload.baseRef).toBe(configBaseRef);
      expect(initPayload.auditors).toEqual([configAuditor]);
      expect(initPayload.runFilePath).toContain(auditBranchRunsDir(harness.productDir, slugAuditBranchIdentity(branch)));
    } finally {
      await removeTempDir(linkedParentDir);
      await harness.cleanup();
    }
  });

  it("does not create a run journal when audit config validation fails", async () => {
    const harness = await createAuditHarness();
    try {
      await writeInvalidAuditConfig(harness.productDir);

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(init.exitCode).toBe(1);

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(status.exitCode).toBe(0);
      const statusPayload = JSON.parse(status.output) as {
        readonly terminalRuns: readonly unknown[];
        readonly incompleteRuns: readonly unknown[];
      };
      expect(statusPayload.terminalRuns).toHaveLength(0);
      expect(statusPayload.incompleteRuns).toHaveLength(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("prints incomplete run file names and reasons in text-mode status output", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch], harness.productDir);

      expect(status.exitCode).toBe(0);
      expect(status.output).toContain(singleIncompleteRunCountText);
      expect(status.output).toContain(
        `${AUDIT_LIFECYCLE_TEXT_LABEL.INCOMPLETE}${basename(runFilePath)} (${
          AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE
        })`,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("prints incomplete run diagnostic details in text-mode status output", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      await appendInvalidCompletedEvent(runFilePath);

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch], harness.productDir);

      expect(status.exitCode).toBe(0);
      expect(status.output).toContain(singleIncompleteRunCountText);
      expect(status.output).toContain(
        `${AUDIT_LIFECYCLE_TEXT_LABEL.INCOMPLETE}${basename(runFilePath)} (${
          AUDIT_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE
        })`,
      );
      expect(status.output).toContain(AUDIT_RUN_STATE_FIELDS.BRANCH_NAME);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects run-file paths outside branch-scoped audit run storage", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const outsideRunFile = join(harness.productDir, basename(runFilePath));

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        outsideRunFile,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const close = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        outsideRunFile,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(close.exitCode).toBe(1);
      expect((JSON.parse(close.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      expect(await fileExists(outsideRunFile)).toBe(false);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects missing branch-scoped run files without creating them", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const missingRunFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.missingRunFileName());
      const missingRunFile = join(dirname(runFilePath), missingRunFileName);

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        missingRunFile,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.MISSING_INIT_EVENT,
      );
      expect(await fileExists(missingRunFile)).toBe(false);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects progress after an unsealed terminal completion event without changing the journal", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      await appendUnsealedCompletedEvent(runFilePath);
      const beforeProgress = await createAppendableJournalStore({ runFilePath }).readAll();

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS,
      );
      await expect(createAppendableJournalStore({ runFilePath }).readAll()).resolves.toEqual(beforeProgress);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects branch-scoped run files replaced by symlinks without writing through them", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const symlinkTarget = join(harness.productDir, "outside-audit-run-target.jsonl");
      const symlinkTargetContent = "external target\n";
      await writeFile(symlinkTarget, symlinkTargetContent);
      await rm(runFilePath);
      await symlink(symlinkTarget, runFilePath);

      const directRead = await readAuditRunEvents(harness.productDir, runFilePath);
      expect(directRead).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });

      const directProgress = await auditProgressCommand({
        runFile: runFilePath,
        step: AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        json: true,
      }, { cwd: harness.productDir });
      expect(directProgress.exitCode).toBe(1);
      expect((JSON.parse(directProgress.output) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const directClose = await auditCloseCommand({
        runFile: runFilePath,
        status: AUDIT_RUN_STATE_STATUS.APPROVED,
        json: true,
      }, { cwd: harness.productDir });
      expect(directClose.exitCode).toBe(1);
      expect((JSON.parse(directClose.output) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const close = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(close.exitCode).toBe(1);
      expect((JSON.parse(close.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      expect(await readFile(symlinkTarget, STATE_STORE_TEXT_ENCODING)).toBe(symlinkTargetContent);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects branch-scoped run files with symlinked seal markers without writing through them", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const sealMarkerPath = appendableJournalSealMarkerPath(runFilePath);
      const symlinkTarget = join(harness.productDir, "outside-audit-seal-target");
      const symlinkTargetContent = "external seal target\n";
      await writeFile(symlinkTarget, symlinkTargetContent);
      await symlink(symlinkTarget, sealMarkerPath);

      const close = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(close.exitCode).toBe(1);
      expect((JSON.parse(close.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      expect(await readFile(symlinkTarget, STATE_STORE_TEXT_ENCODING)).toBe(symlinkTargetContent);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects branch-scoped run files under symlinked run directories without writing through them", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const runsDir = dirname(runFilePath);
      const runFileName = basename(runFilePath);
      const symlinkTargetDir = join(harness.productDir, "outside-audit-runs");
      const symlinkTargetPath = join(symlinkTargetDir, runFileName);
      const symlinkTargetContent = "external directory target\n";
      await mkdir(symlinkTargetDir);
      await writeFile(symlinkTargetPath, symlinkTargetContent);
      await rm(runsDir, { recursive: true });
      await symlink(symlinkTargetDir, runsDir);

      const directRead = await readAuditRunEvents(harness.productDir, runFilePath);
      expect(directRead).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      const directBranchRuns = await readAuditBranchRuns(harness.productDir, slugAuditBranchIdentity(branch));
      expect(directBranchRuns).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const close = await runSpxAudit([
        AUDIT_CLI.closeCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STATUS,
        AUDIT_RUN_STATE_STATUS.APPROVED,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);
      expect(close.exitCode).toBe(1);
      expect((JSON.parse(close.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(status.exitCode).toBe(1);
      expect((JSON.parse(status.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const list = await runSpxAudit([AUDIT_CLI.listCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(list.exitCode).toBe(1);
      expect((JSON.parse(list.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      expect(await readFile(symlinkTargetPath, STATE_STORE_TEXT_ENCODING)).toBe(symlinkTargetContent);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects branch-scoped run files under symlinked branch directories without reading through them", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);
      const runsDir = dirname(runFilePath);
      const branchDir = dirname(dirname(runsDir));
      const runFileName = basename(runFilePath);
      const symlinkTargetDir = join(harness.productDir, "outside-audit-branch");
      const symlinkTargetRunsDir = join(symlinkTargetDir, STATE_STORE_DOMAIN.AUDIT, STATE_STORE_PATH.RUNS_DIR);
      const symlinkTargetPath = join(symlinkTargetRunsDir, runFileName);
      const symlinkTargetContent = "external branch target\n";
      await mkdir(symlinkTargetRunsDir, { recursive: true });
      await writeFile(symlinkTargetPath, symlinkTargetContent);
      await rm(branchDir, { recursive: true });
      await symlink(symlinkTargetDir, branchDir);

      const directBranchRuns = await readAuditBranchRuns(harness.productDir, slugAuditBranchIdentity(branch));
      expect(directBranchRuns).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });

      const status = await runSpxAudit([AUDIT_CLI.statusCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(status.exitCode).toBe(1);
      expect((JSON.parse(status.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const list = await runSpxAudit([AUDIT_CLI.listCommandName, AUDIT_CLI_FLAG.BRANCH, branch, AUDIT_CLI_FLAG.JSON], harness.productDir);
      expect(list.exitCode).toBe(1);
      expect((JSON.parse(list.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      expect(await readFile(symlinkTargetPath, STATE_STORE_TEXT_ENCODING)).toBe(symlinkTargetContent);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects init under symlinked branch directories without writing through them", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: baseRef,
        auditors: [auditor],
        include: [target],
      });
      const branchSlug = slugAuditBranchIdentity(branch);
      const branchDir = dirname(dirname(auditBranchRunsDir(harness.productDir, branchSlug)));
      const symlinkTargetDir = join(harness.productDir, "outside-audit-init-branch");
      await mkdir(dirname(branchDir), { recursive: true });
      await mkdir(symlinkTargetDir);
      await symlink(symlinkTargetDir, branchDir);

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
        AUDIT_CLI_FLAG.JSON,
      ], harness.productDir);

      expect(init.exitCode).toBe(1);
      expect((JSON.parse(init.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );
      await expect(
        readFile(join(symlinkTargetDir, STATE_STORE_DOMAIN.AUDIT, STATE_STORE_PATH.RUNS_DIR), STATE_STORE_TEXT_ENCODING),
      ).rejects.toMatchObject({
        code: ERROR_CODE_NOT_FOUND,
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("removes the reserved run file when init cannot append its started event", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: baseRef,
        auditors: [auditor],
        include: [target],
      });
      const appendError = AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED;
      const failingStartedEventFileSystem: AuditRunStateFileSystem = {
        ...defaultStateStoreFileSystem,
        appendFile: () => Promise.reject(new Error(appendError)),
      };

      const init = await auditInitCommand({
        branch: branch,
        headSha: headSha,
        json: true,
      }, {
        cwd: harness.productDir,
        fs: failingStartedEventFileSystem,
      });

      expect(init.exitCode).toBe(1);
      expect((JSON.parse(init.output) as { readonly error: string }).error).toContain(appendError);
      const runs = await readAuditBranchRuns(harness.productDir, slugAuditBranchIdentity(branch));
      expect(runs).toEqual({ ok: true, value: { terminalRuns: [], incompleteRuns: [] } });
    } finally {
      await harness.cleanup();
    }
  });

  it("prints the full text-mode run file path from init", async () => {
    const harness = await createAuditHarness();
    try {
      const branch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.overlongBranchName());
      await writeAuditConfig(harness.productDir, {
        baseRef: baseRef,
        auditors: [auditor],
        include: [target],
      });

      const init = await runSpxAudit([
        AUDIT_CLI.initCommandName,
        AUDIT_CLI_FLAG.BRANCH,
        branch,
        AUDIT_CLI_FLAG.HEAD_SHA,
        headSha,
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const runFileLine = init.output
        .split("\n")
        .find((line) => line.startsWith(runFileLabel));
      expect(runFileLine).toBeDefined();
      if (runFileLine === undefined) throw new Error("run file output line missing");
      const runFilePath = runFileLine.slice(runFileLabel.length);
      expect(runFilePath.length).toBeGreaterThan(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      expect(runFilePath.endsWith(ELLIPSIS_TOKEN)).toBe(false);
      expect(runFilePath).toContain(auditBranchRunsDir(harness.productDir, slugAuditBranchIdentity(branch)));
      expect(await fileExists(runFilePath)).toBe(true);

      const progress = await runSpxAudit([
        AUDIT_CLI.progressCommandName,
        AUDIT_CLI_FLAG.RUN_FILE,
        runFilePath,
        AUDIT_CLI_FLAG.STEP,
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
      ], harness.productDir);
      expect(progress.exitCode).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });
});

async function runSpxAudit(args: readonly string[], cwd: string): Promise<{
  readonly output: string;
  readonly errorOutput: string;
  readonly exitCode: number;
}> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, AUDIT_CLI.commandName, ...args], { cwd, reject: false });
  return { output: result.stdout, errorOutput: result.stderr, exitCode: result.exitCode ?? 1 };
}

async function initializeDefaultAuditRun(productDir: string): Promise<string> {
  await writeAuditConfig(productDir, {
    baseRef: baseRef,
    auditors: [auditor],
    include: [target],
  });
  const init = await runSpxAudit([
    AUDIT_CLI.initCommandName,
    AUDIT_CLI_FLAG.BRANCH,
    branch,
    AUDIT_CLI_FLAG.HEAD_SHA,
    headSha,
    AUDIT_CLI_FLAG.JSON,
  ], productDir);
  expect(init.exitCode).toBe(0);
  return (JSON.parse(init.output) as { readonly runFilePath: string }).runFilePath;
}

async function appendInvalidCompletedEvent(runFilePath: string): Promise<void> {
  const streamId = basename(runFilePath);
  const store = createAppendableJournalStore({ runFilePath });
  const journal = createJournal(store, { streamid: streamId, runid: streamId });
  await journal.append({
    id: `${streamId}:${AUDIT_RUN_EVENT.COMPLETED_TYPE}`,
    source: AUDIT_RUN_EVENT.SOURCE,
    type: AUDIT_RUN_EVENT.COMPLETED_TYPE,
    time: new Date().toISOString(),
    attempt: 1,
    data: {},
  });
  await journal.seal();
}

async function appendUnsealedCompletedEvent(runFilePath: string): Promise<void> {
  const streamId = basename(runFilePath);
  const store = createAppendableJournalStore({ runFilePath });
  const journal = createJournal(store, { streamid: streamId, runid: streamId });
  await journal.append({
    id: `${streamId}:${AUDIT_RUN_EVENT.COMPLETED_TYPE}`,
    source: AUDIT_RUN_EVENT.SOURCE,
    type: AUDIT_RUN_EVENT.COMPLETED_TYPE,
    time: new Date().toISOString(),
    attempt: 1,
    data: {
      branchName: branch,
      branchSlug: slugAuditBranchIdentity(branch),
      headSha: headSha,
      baseRef: baseRef,
      auditConfigDigest: headSha,
      auditors: [auditor],
      targets: { include: [target] },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: AUDIT_RUN_STATE_STATUS.APPROVED,
    },
  });
}

async function writeInvalidAuditConfig(productDir: string): Promise<void> {
  await writeFile(
    join(productDir, DEFAULT_CONFIG_FILENAME),
    [
      `${AUDIT_SECTION}:`,
      `  ${AUDIT_CONFIG_FIELDS.BASE_REF}: 12`,
      "",
    ].join("\n"),
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, STATE_STORE_TEXT_ENCODING);
    return true;
  } catch {
    return false;
  }
}
