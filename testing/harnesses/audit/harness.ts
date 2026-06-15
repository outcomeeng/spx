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

import { AUDIT_RUN_EVENT, auditRunCompletedEventInput, type AuditRunState } from "@/domains/audit/run-state";
import { createJournal } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { branchScopeDir, runsDir, STATE_STORE_DOMAIN } from "@/lib/state-store";

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

/**
 * Writes a run journal for the given terminal states through the real
 * appendable journal store: each state becomes one completed event appended in
 * order under the run file.
 */
export async function writeAuditRunJournal(
  productDir: string,
  branchSlug: string,
  runFileName: string,
  states: readonly AuditRunState[],
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
  // Mirror the production write path: a completed run's journal is sealed.
  await journal.seal();
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
