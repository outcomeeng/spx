import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AuditRunStateFileSystem,
  createAuditRunFile,
  readAuditBranchRuns,
  writeTerminalAuditRunState,
} from "@/commands/audit/run-state";
import {
  AUDIT_RUN_EVENT,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  AUDIT_RUN_STATE_STATUS,
  auditRunStateRecord,
  foldAuditRunState,
  formatAuditRunTimestamp,
  selectLatestTerminalAuditRun,
} from "@/domains/audit/run-state";
import { createJournal, type JsonValue } from "@/lib/agent-run-journal";
import { appendableJournalSealMarkerPath, createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { STATE_STORE_ERROR } from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  auditBranchRunsDir,
  createAuditHarness,
  writeAuditRunJournal,
  writeAuditRunJournalContent,
} from "@testing/harnesses/audit/harness";

async function withAuditHarness(callback: (productDir: string) => Promise<void>): Promise<void> {
  const harness = await createAuditHarness();
  try {
    await callback(harness.productDir);
  } finally {
    await harness.cleanup();
  }
}

/**
 * Appends each payload as a completed event through the real appendable journal
 * store — so the events folded are exactly what the store produces (the store
 * stamps `seq`, `specversion`, and the stream identity) — then folds them.
 */
async function foldStoredCompletedEvents(
  productDir: string,
  branchSlug: string,
  payloads: readonly JsonValue[],
): Promise<ReturnType<typeof foldAuditRunState>> {
  const runFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
  const runFilePath = join(auditBranchRunsDir(productDir, branchSlug), runFileName);
  await mkdir(dirname(runFilePath), { recursive: true });
  const backend = createAppendableJournalStore({ runFilePath });
  const journal = createJournal(backend, { streamid: runFileName, runid: runFileName });
  for (const [index, data] of payloads.entries()) {
    await journal.append({
      id: `${runFileName}:${index}`,
      source: AUDIT_RUN_EVENT.SOURCE,
      type: AUDIT_RUN_EVENT.COMPLETED_TYPE,
      time: formatAuditRunTimestamp(sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate())),
      attempt: index + 1,
      data,
    });
  }
  return foldAuditRunState(await backend.readAll());
}

describe("audit run-state projection fold", () => {
  it("folds a completed event's payload into the AuditRunState envelope", async () => {
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());

    await withAuditHarness(async (productDir) => {
      const result = await foldStoredCompletedEvents(productDir, branchSlug, [auditRunStateRecord(state)]);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.value).toEqual(state);
    });
  });

  it("treats a journal with no completed event as missing terminal state", () => {
    const result = foldAuditRunState([]);

    expect(result).toEqual({ ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE });
  });

  it("treats a completed event with an invalid payload as shape-invalid", async () => {
    const invalidPayload = { status: sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName()) };
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());

    await withAuditHarness(async (productDir) => {
      const result = await foldStoredCompletedEvents(productDir, branchSlug, [invalidPayload]);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected shape-invalid fold");
      expect(result.reason).toBe(AUDIT_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE);
    });
  });

  it("folds the latest completed event when several are present", async () => {
    const earlier = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const latest = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());

    await withAuditHarness(async (productDir) => {
      const result = await foldStoredCompletedEvents(productDir, branchSlug, [
        auditRunStateRecord(earlier),
        auditRunStateRecord(latest),
      ]);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.value).toEqual(latest);
    });
  });
});

describe("audit branch run-state lookup", () => {
  it("reads terminal run journals and classifies malformed journals as incomplete evidence", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const terminalRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const malformedRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withAuditHarness(async (productDir) => {
      await writeAuditRunJournal(productDir, branchSlug, terminalRun, [state]);
      await writeAuditRunJournalContent(productDir, branchSlug, malformedRun, "{\n");

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns.map((run) => run.runFileName)).toEqual([terminalRun]);
      expect(result.value.terminalRuns[0]?.state).toEqual(state);
      // The store silently drops the non-conformant line, so a corrupt journal
      // is indistinguishable from one with no completed event: both fold to
      // MISSING_STATE. There is no separate parse-invalid reason by design.
      expect(result.value.incompleteRuns).toEqual([
        {
          runFileName: malformedRun,
          runFilePath: `${auditBranchRunsDir(productDir, branchSlug)}/${malformedRun}`,
          reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
        },
      ]);
    });
  });

  it("classifies run-journal read failures as I/O incomplete evidence", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const error = Object.assign(new Error(errorCode), { code: errorCode });
    const fs: AuditRunStateFileSystem = {
      mkdir: () => Promise.resolve(),
      writeFile: () => Promise.resolve(),
      appendFile: () => Promise.resolve(),
      readFile: () => Promise.reject(error),
      readdir: () => Promise.resolve([{ name: runFileName, isFile: () => true }]),
      lstat: () => Promise.resolve({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }),
      rm: () => Promise.resolve(),
    };

    await withAuditHarness(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, branchSlug, { fs });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns).toEqual([]);
      expect(result.value.incompleteRuns).toEqual([
        {
          runFileName,
          runFilePath: `${auditBranchRunsDir(productDir, branchSlug)}/${runFileName}`,
          reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
          error: errorCode,
        },
      ]);
    });
  });

  it("ignores entries that are not audit run files", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const nonRunFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withAuditHarness(async (productDir) => {
      await writeAuditRunJournal(productDir, branchSlug, runFileName, [state]);
      await writeAuditRunJournalContent(productDir, branchSlug, nonRunFileName, "{\n");

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns.map((run) => run.runFileName)).toEqual([runFileName]);
      expect(result.value.incompleteRuns).toEqual([]);
    });
  });

  it("selects the latest terminal run by completedAt, startedAt, then run file name", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const baseState = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const earlierRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const laterStartedRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const tieBreakerRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const baseDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const earlierCompletedAt = formatAuditRunTimestamp(baseDate);
    const completedAt = formatAuditRunTimestamp(new Date(baseDate.getTime() + 1));
    const earlierStartedAt = formatAuditRunTimestamp(baseDate);
    const laterStartedAt = formatAuditRunTimestamp(new Date(baseDate.getTime() + 2));

    await withAuditHarness(async (productDir) => {
      await writeAuditRunJournal(productDir, branchSlug, earlierRun, [
        { ...baseState, status: AUDIT_RUN_STATE_STATUS.APPROVED, completedAt: earlierCompletedAt },
      ]);
      await writeAuditRunJournal(productDir, branchSlug, laterStartedRun, [
        { ...baseState, status: AUDIT_RUN_STATE_STATUS.REJECTED, completedAt, startedAt: earlierStartedAt },
      ]);
      await writeAuditRunJournal(productDir, branchSlug, tieBreakerRun, [
        { ...baseState, status: AUDIT_RUN_STATE_STATUS.FAILED, completedAt, startedAt: laterStartedAt },
      ]);

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(selectLatestTerminalAuditRun(result.value.terminalRuns)?.runFileName).toBe(tieBreakerRun);
    });
  });

  it("reads a run written through the production write path and rejects a duplicate terminal write", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withAuditHarness(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => Buffer.from(runId, "hex"),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);

      const written = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);
      expect(written.ok).toBe(true);
      expect(existsSync(appendableJournalSealMarkerPath(runFile.value.runFilePath))).toBe(true);

      const read = await readAuditBranchRuns(productDir, branchSlug);
      expect(read.ok).toBe(true);
      if (!read.ok) throw new Error(read.error);
      expect(read.value.terminalRuns.map((run) => run.runFileName)).toEqual([runFile.value.runFileName]);
      expect(read.value.terminalRuns[0]?.state).toEqual(state);

      const duplicate = await writeTerminalAuditRunState(productDir, runFile.value.runFilePath, state);
      expect(duplicate).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS });

      const events = await createAppendableJournalStore({ runFilePath: runFile.value.runFilePath }).readAll();
      const completed = events.filter((event) => event.type === AUDIT_RUN_EVENT.COMPLETED_TYPE);
      expect(completed).toHaveLength(1);
    });
  });

  it("treats an unsealed run journal as incomplete even when it holds a completed event", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withAuditHarness(async (productDir) => {
      await writeAuditRunJournal(productDir, branchSlug, runFileName, [state], { seal: false });

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns).toEqual([]);
      expect(result.value.incompleteRuns.map((run) => run.reason)).toEqual([
        AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
      ]);
    });
  });

  it("rejects unnormalized branch slugs before reading branch runs", async () => {
    const invalidBranchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withAuditHarness(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, invalidBranchSlug);

      expect(result).toEqual({ ok: false, error: STATE_STORE_ERROR.INVALID_BRANCH_SLUG });
    });
  });
});
