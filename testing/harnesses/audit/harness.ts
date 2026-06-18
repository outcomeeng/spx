/**
 * Audit test harness — reusable fixture factory for audit domain tests.
 *
 * Provides temp product directory creation, branch run-file directory
 * derivation, and run-journal construction over the real appendable journal
 * store. All path values derive from state-store scope helpers — no hardcoded
 * path separators or directory names.
 *
 * @module audit/testing/harness
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import { AUDIT_CONFIG_FIELDS, AUDIT_SECTION } from "@/domains/audit/config";
import { AUDIT_CLI, AUDIT_CLI_FLAG } from "@/interfaces/cli/audit";
import { AUDIT_RUN_EVENT, auditRunCompletedEventInput, type AuditRunState } from "@/domains/audit/run-state";
import { createJournal } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { branchScopeDir, runsDir, STATE_STORE_DOMAIN } from "@/lib/state-store";

import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

/** Audit test harness interface. */
export interface AuditHarness {
  /** Absolute path to the temp directory used as a fake product directory. */
  readonly productDir: string;

  /** Removes the temp product directory and all contents. */
  cleanup(): Promise<void>;
}

/** Creates an audit test harness backed by a temp product directory. */
export async function createAuditHarness(): Promise<AuditHarness> {
  const productDir = await createTempDir("spx-audit-harness-");

  return {
    productDir,
    cleanup(): Promise<void> {
      return removeTempDir(productDir);
    },
  };
}

/** The branch-scoped audit runs directory under a product directory. */
export function auditBranchRunsDir(productDir: string, branchSlug: string): string {
  const branchDir = branchScopeDir(productDir, branchSlug);
  if (!branchDir.ok) throw new Error(branchDir.error);
  const auditRunsDir = runsDir(branchDir.value, STATE_STORE_DOMAIN.AUDIT);
  if (!auditRunsDir.ok) throw new Error(auditRunsDir.error);
  return auditRunsDir.value;
}

export interface WriteAuditConfigOptions {
  readonly baseRef: string;
  readonly auditors: readonly string[];
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export interface InitializeAuditRunOptions extends WriteAuditConfigOptions {
  readonly branch: string;
  readonly headSha: string;
}

/** Writes the product audit config file used by CLI lifecycle tests. */
export async function writeAuditConfig(productDir: string, config: WriteAuditConfigOptions): Promise<void> {
  await writeFile(
    join(productDir, DEFAULT_CONFIG_FILENAME),
    [
      `${AUDIT_SECTION}:`,
      `  ${AUDIT_CONFIG_FIELDS.BASE_REF}: ${config.baseRef}`,
      `  ${AUDIT_CONFIG_FIELDS.AUDITORS}:`,
      ...config.auditors.map((auditor) => `    - ${auditor}`),
      ...(config.include === undefined && config.exclude === undefined
        ? []
        : [
          `  ${AUDIT_CONFIG_FIELDS.TARGETS}:`,
          ...(config.include === undefined
            ? []
            : [
              `    ${PATH_FILTER_CONFIG_FIELDS.INCLUDE}:`,
              ...config.include.map((target) => `      - ${target}`),
            ]),
          ...(config.exclude === undefined
            ? []
            : [
              `    ${PATH_FILTER_CONFIG_FIELDS.EXCLUDE}:`,
              ...config.exclude.map((target) => `      - ${target}`),
            ]),
        ]),
      "",
    ].join("\n"),
  );
}

export interface WriteAuditRunJournalOptions {
  /** Seal the run journal after appending, mirroring the production write path. Default true. */
  readonly seal?: boolean;
}

/**
 * Writes a run journal for the given terminal states through the real
 * appendable journal store: each state becomes one completed event appended in
 * order under the run file. Sealing is the terminal commit; pass `seal: false`
 * to leave the events unsealed, modeling a write interrupted before sealing.
 */
export async function writeAuditRunJournal(
  productDir: string,
  branchSlug: string,
  runFileName: string,
  states: readonly AuditRunState[],
  options: WriteAuditRunJournalOptions = {},
): Promise<string> {
  const runFilePath = join(auditBranchRunsDir(productDir, branchSlug), runFileName);
  await mkdir(dirname(runFilePath), { recursive: true });
  const journal = createJournal(createAppendableJournalStore({ runFilePath }), {
    streamid: runFileName,
    runid: runFileName,
  });
  for (const [index, state] of states.entries()) {
    await journal.append(
      auditRunCompletedEventInput(state, {
        id: `${runFileName}:${AUDIT_RUN_EVENT.COMPLETED_TYPE}:${index}`,
        time: state.completedAt,
        attempt: index + 1,
      }),
    );
  }
  if (options.seal ?? true) {
    await journal.seal();
  }
  return runFilePath;
}

/** Writes raw run-file content for malformed or partial-journal fixtures. */
export async function writeAuditRunJournalContent(
  productDir: string,
  branchSlug: string,
  runFileName: string,
  content: string,
): Promise<string> {
  const runFilePath = join(auditBranchRunsDir(productDir, branchSlug), runFileName);
  await mkdir(dirname(runFilePath), { recursive: true });
  await writeFile(runFilePath, content);
  return runFilePath;
}

export interface AuditCliResult {
  readonly output: string;
  readonly errorOutput: string;
  readonly exitCode: number;
}

/** Runs the source CLI audit command from a test product directory. */
export async function runSpxAudit(args: readonly string[], cwd: string): Promise<AuditCliResult> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, AUDIT_CLI.commandName, ...args], { cwd, reject: false });
  return { output: result.stdout, errorOutput: result.stderr, exitCode: result.exitCode ?? 1 };
}

/** Writes audit config, runs `spx audit init`, and returns the run file path. */
export async function initializeAuditRun(productDir: string, options: InitializeAuditRunOptions): Promise<string> {
  await writeAuditConfig(productDir, options);
  const init = await runSpxAudit([
    AUDIT_CLI.initCommandName,
    AUDIT_CLI_FLAG.BRANCH,
    options.branch,
    AUDIT_CLI_FLAG.HEAD_SHA,
    options.headSha,
    AUDIT_CLI_FLAG.JSON,
  ], productDir);
  if (init.exitCode !== 0) throw new Error(init.errorOutput);
  return (JSON.parse(init.output) as { readonly runFilePath: string }).runFilePath;
}
