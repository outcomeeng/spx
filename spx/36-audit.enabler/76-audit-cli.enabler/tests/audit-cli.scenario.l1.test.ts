import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { execa } from "execa";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { AUDIT_PROGRESS_STEP } from "@/commands/audit/lifecycle";
import {
  AUDIT_RUN_EVENT,
  AUDIT_RUN_STATE_DISPLAY,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_STATUS,
  slugAuditBranchIdentity,
} from "@/domains/audit/run-state";
import { AUDIT_CLI } from "@/interfaces/cli/audit";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { ELLIPSIS_TOKEN, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/cli-sanitize";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { createAuditHarness } from "@testing/harnesses/audit/harness";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, readGit, runGit } from "@testing/harnesses/git-test-constants";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const AUDITOR = "typescript-test-auditor";
const TARGET = "src/plugins/typescript/skills/audit-typescript-tests";
const BRANCH = "audit-lifecycle-slice";
const HEAD_SHA = "0000000000000000000000000000000000000000";
const BASE_REF = "origin/main";
const CONFIG_BASE_REF = "release/base";
const CONFIG_AUDITOR = "configured-test-auditor";
const CONFIG_TARGET_INCLUDE = "spx/36-audit.enabler";
const CONFIG_TARGET_EXCLUDE = "spx/36-audit.enabler/ISSUES.md";
const LINKED_WORKTREE_BRANCH = "linked-audit-config";
const RUN_FILE_LABEL = "run file: ";

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
        baseRef: BASE_REF,
        auditors: [AUDITOR],
        include: [TARGET],
      });
      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly branchName: string;
        readonly branchSlug: string;
        readonly runFilePath: string;
        readonly startedAt: string;
      };
      const runFile = initPayload.runFilePath;
      expect(initPayload.branchName).toBe(BRANCH);
      expect(initPayload.branchSlug).toBe(slugAuditBranchIdentity(BRANCH));
      expect(runFile).toContain(initPayload.startedAt);

      for (const step of [
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        AUDIT_PROGRESS_STEP.DIFF_ANALYZED,
        AUDIT_PROGRESS_STEP.ADDITIONAL_FILE_INSPECTED,
        AUDIT_PROGRESS_STEP.VERDICT_CREATED,
        AUDIT_PROGRESS_STEP.FILES_PASSED_FORMAT_CHECK,
        AUDIT_PROGRESS_STEP.DONE,
      ]) {
        const progress = await runSpxAudit([
          "progress",
          "--run-file",
          runFile,
          "--step",
          step,
          "--message",
          step,
        ], harness.productDir);
        expect(progress.exitCode).toBe(0);
      }

      const close = await runSpxAudit([
        "close",
        "--run-file",
        runFile,
        "--status",
        AUDIT_RUN_STATE_STATUS.APPROVED,
      ], harness.productDir);
      expect(close.exitCode).toBe(0);

      const status = await runSpxAudit(["status", "--branch", BRANCH, "--json"], harness.productDir);
      expect(status.exitCode).toBe(0);
      const statusPayload = JSON.parse(status.output) as {
        readonly latest: { readonly state: { readonly status: string; readonly auditors: readonly string[] } };
        readonly terminalRuns: readonly unknown[];
        readonly incompleteRuns: readonly unknown[];
      };
      expect(statusPayload.latest.state.status).toBe(AUDIT_RUN_STATE_STATUS.APPROVED);
      expect(statusPayload.latest.state.auditors).toEqual([AUDITOR]);
      expect(statusPayload.terminalRuns).toHaveLength(1);
      expect(statusPayload.incompleteRuns).toHaveLength(0);

      const list = await runSpxAudit(["list", "--branch", BRANCH], harness.productDir);
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
  });

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
        "initial commit",
      ]);
      await runGit(harness.productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.DETACH, "HEAD"]);
      const headSha = await readGit(harness.productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, "HEAD"]);
      await writeAuditConfig(harness.productDir, {
        baseRef: BASE_REF,
        auditors: [AUDITOR],
        include: [TARGET],
      });

      const init = await runSpxAudit([
        "init",
        "--json",
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly branchName: string;
        readonly branchSlug: string;
        readonly runFilePath: string;
      };
      expect(initPayload.branchName).toBe(`detached-${headSha.slice(0, 12)}`);

      const close = await runSpxAudit([
        "close",
        "--run-file",
        initPayload.runFilePath,
        "--status",
        AUDIT_RUN_STATE_STATUS.APPROVED,
      ], harness.productDir);
      expect(close.exitCode).toBe(0);

      const status = await runSpxAudit(["status", "--json"], harness.productDir);
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

  it("resolves base ref, auditors, and target filters from audit config when CLI overrides are absent", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: CONFIG_BASE_REF,
        auditors: [CONFIG_AUDITOR],
        include: [CONFIG_TARGET_INCLUDE],
        exclude: [CONFIG_TARGET_EXCLUDE],
      });

      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly baseRef: string;
        readonly auditors: readonly string[];
        readonly targets: readonly string[];
      };
      expect(initPayload.baseRef).toBe(CONFIG_BASE_REF);
      expect(initPayload.auditors).toEqual([CONFIG_AUDITOR]);
      expect(initPayload.targets).toEqual([
        `include:${CONFIG_TARGET_INCLUDE}`,
        `exclude:${CONFIG_TARGET_EXCLUDE}`,
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("reads audit config from the current worktree while writing run state under the shared branch scope", async () => {
    const harness = await createAuditHarness();
    const linkedParentDir = await createTempDir("spx-audit-linked-parent-");
    const linkedProductDir = join(linkedParentDir, "linked");
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
        "initial commit",
      ]);
      await runGit(harness.productDir, [
        GIT_TEST_SUBCOMMANDS.WORKTREE,
        GIT_TEST_SUBCOMMANDS.ADD,
        GIT_TEST_FLAGS.NEW_BRANCH,
        LINKED_WORKTREE_BRANCH,
        linkedProductDir,
      ]);
      await writeFile(join(harness.productDir, "spx.config.yaml"), ["audit:", "  baseRef: 12", ""].join("\n"));
      await writeAuditConfig(linkedProductDir, {
        baseRef: CONFIG_BASE_REF,
        auditors: [CONFIG_AUDITOR],
      });

      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], linkedProductDir);

      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as {
        readonly baseRef: string;
        readonly auditors: readonly string[];
        readonly runFilePath: string;
      };
      expect(initPayload.baseRef).toBe(CONFIG_BASE_REF);
      expect(initPayload.auditors).toEqual([CONFIG_AUDITOR]);
      expect(initPayload.runFilePath).toContain(`/.spx/branch/${slugAuditBranchIdentity(BRANCH)}/audit/runs/`);
    } finally {
      await removeTempDir(linkedParentDir);
      await harness.cleanup();
    }
  });

  it("does not create a run journal when audit config validation fails", async () => {
    const harness = await createAuditHarness();
    try {
      await writeFile(join(harness.productDir, "spx.config.yaml"), ["audit:", "  baseRef: 12", ""].join("\n"));

      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], harness.productDir);
      expect(init.exitCode).toBe(1);

      const status = await runSpxAudit(["status", "--branch", BRANCH, "--json"], harness.productDir);
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

  it("rejects run-file paths outside branch-scoped audit run storage", async () => {
    const harness = await createAuditHarness();
    try {
      await writeAuditConfig(harness.productDir, {
        baseRef: BASE_REF,
        auditors: [AUDITOR],
        include: [TARGET],
      });
      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], harness.productDir);
      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as { readonly runFilePath: string };
      const outsideRunFile = join(harness.productDir, basename(initPayload.runFilePath));

      const progress = await runSpxAudit([
        "progress",
        "--run-file",
        outsideRunFile,
        "--step",
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        "--json",
      ], harness.productDir);
      expect(progress.exitCode).toBe(1);
      expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
        AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH,
      );

      const close = await runSpxAudit([
        "close",
        "--run-file",
        outsideRunFile,
        "--status",
        AUDIT_RUN_STATE_STATUS.APPROVED,
        "--json",
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
      await writeAuditConfig(harness.productDir, {
        baseRef: BASE_REF,
        auditors: [AUDITOR],
        include: [TARGET],
      });
      const init = await runSpxAudit([
        "init",
        "--branch",
        BRANCH,
        "--head-sha",
        HEAD_SHA,
        "--json",
      ], harness.productDir);
      expect(init.exitCode).toBe(0);
      const initPayload = JSON.parse(init.output) as { readonly runFilePath: string };
      const missingRunFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.missingRunFileName());
      const missingRunFile = join(dirname(initPayload.runFilePath), missingRunFileName);

      const progress = await runSpxAudit([
        "progress",
        "--run-file",
        missingRunFile,
        "--step",
        AUDIT_PROGRESS_STEP.CHANGESET_DETERMINED,
        "--json",
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

  it("prints the full text-mode run file path from init", async () => {
    const harness = await createAuditHarness();
    try {
      const branch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.overlongBranchName());
      await writeAuditConfig(harness.productDir, {
        baseRef: BASE_REF,
        auditors: [AUDITOR],
        include: [TARGET],
      });

      const init = await runSpxAudit([
        "init",
        "--branch",
        branch,
        "--head-sha",
        HEAD_SHA,
      ], harness.productDir);

      expect(init.exitCode).toBe(0);
      const runFileLine = init.output
        .split("\n")
        .find((line) => line.startsWith(RUN_FILE_LABEL));
      expect(runFileLine).toBeDefined();
      if (runFileLine === undefined) throw new Error("run file output line missing");
      const runFilePath = runFileLine.slice(RUN_FILE_LABEL.length);
      expect(runFilePath.length).toBeGreaterThan(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
      expect(runFilePath.endsWith(ELLIPSIS_TOKEN)).toBe(false);
      expect(runFilePath).toContain(`/.spx/branch/${slugAuditBranchIdentity(branch)}/audit/runs/`);
      expect(await fileExists(runFilePath)).toBe(true);

      const progress = await runSpxAudit([
        "progress",
        "--run-file",
        runFilePath,
        "--step",
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
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, "audit", ...args], { cwd, reject: false });
  return { output: result.stdout, errorOutput: result.stderr, exitCode: result.exitCode ?? 1 };
}

async function writeAuditConfig(productDir: string, config: {
  readonly baseRef: string;
  readonly auditors: readonly string[];
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}): Promise<void> {
  await writeFile(
    join(productDir, "spx.config.yaml"),
    [
      "audit:",
      `  baseRef: ${config.baseRef}`,
      "  auditors:",
      ...config.auditors.map((auditor) => `    - ${auditor}`),
      ...(config.include === undefined && config.exclude === undefined
        ? []
        : [
          "  targets:",
          ...(config.include === undefined ? [] : ["    include:", ...config.include.map((target) => `      - ${target}`)]),
          ...(config.exclude === undefined ? [] : ["    exclude:", ...config.exclude.map((target) => `      - ${target}`)]),
        ]),
      "",
    ].join("\n"),
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}
