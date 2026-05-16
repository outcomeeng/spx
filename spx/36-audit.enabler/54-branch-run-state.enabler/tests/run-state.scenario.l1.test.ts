import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE } from "@/domains/audit/reader";
import {
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  AUDIT_RUN_STATE_STATUS,
  type AuditRunStateFileSystem,
  formatAuditRunTimestamp,
  readAuditBranchRuns,
  selectLatestTerminalAuditRun,
} from "@/domains/audit/run-state";
import { runVerifyPipeline } from "@/domains/audit/verify";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { auditBranchRunsDir, createAuditHarness, renderAuditVerdictXml } from "@testing/harnesses/audit/harness";

async function writeState(
  productDir: string,
  branchSlug: string,
  runDirectoryName: string,
  state: unknown,
): Promise<void> {
  const runDir = join(auditBranchRunsDir(productDir, branchSlug), runDirectoryName);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, DEFAULT_AUDIT_CONFIG.storage.stateFile), JSON.stringify(state));
}

async function withTempProductDir(callback: (productDir: string) => Promise<void>): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  try {
    await callback(productDir);
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

const DIRECTORY_ENTRY_NAME = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

function createReadFailingFileSystem(error: Error & { readonly code: string }): AuditRunStateFileSystem {
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    readFile: async () => {
      throw error;
    },
    readdir: async () => [
      {
        name: DIRECTORY_ENTRY_NAME,
        isDirectory: () => true,
      },
    ],
  };
}

describe("audit branch run-state lookup", () => {
  it("classifies missing, partial, and shape-invalid state files as incomplete evidence", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const missingRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const partialRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const invalidRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      await mkdir(join(auditBranchRunsDir(productDir, branchSlug), missingRun), { recursive: true });
      await mkdir(join(auditBranchRunsDir(productDir, branchSlug), partialRun), { recursive: true });
      await writeFile(
        join(auditBranchRunsDir(productDir, branchSlug), partialRun, DEFAULT_AUDIT_CONFIG.storage.stateFile),
        "{",
      );
      await writeState(productDir, branchSlug, invalidRun, {
        ...sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState()),
        status: sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName()),
      });

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns).toEqual([]);
      expect(result.value.incompleteRuns.map((run) => run.reason).sort()).toEqual(
        [
          AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
          AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
          AUDIT_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
        ].sort(),
      );
    });
  });

  it("classifies state file read failures as I/O incomplete evidence", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const error = Object.assign(new Error(errorCode), { code: errorCode });

    await withTempProductDir(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, branchSlug, {
        fs: createReadFailingFileSystem(error),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns).toEqual([]);
      expect(result.value.incompleteRuns).toEqual([
        {
          runDirectoryName: DIRECTORY_ENTRY_NAME,
          runDir: join(auditBranchRunsDir(productDir, branchSlug), DIRECTORY_ENTRY_NAME),
          statePath: join(
            auditBranchRunsDir(productDir, branchSlug),
            DIRECTORY_ENTRY_NAME,
            DEFAULT_AUDIT_CONFIG.storage.stateFile,
          ),
          reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
          error: errorCode,
        },
      ]);
    });
  });

  it("selects the latest terminal run by completedAt, startedAt, then run directory name", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const baseState = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const earlierRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const laterStartedRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const tieBreakerRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const baseDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const earlierCompletedAt = formatAuditRunTimestamp(baseDate);
    const completedAt = formatAuditRunTimestamp(new Date(baseDate.getTime() + 1));
    const earlierStartedAt = formatAuditRunTimestamp(baseDate);
    const laterStartedAt = formatAuditRunTimestamp(new Date(baseDate.getTime() + 2));

    await withTempProductDir(async (productDir) => {
      await writeState(productDir, branchSlug, earlierRun, {
        ...baseState,
        status: AUDIT_RUN_STATE_STATUS.APPROVED,
        completedAt: earlierCompletedAt,
      });
      await writeState(productDir, branchSlug, laterStartedRun, {
        ...baseState,
        status: AUDIT_RUN_STATE_STATUS.REJECTED,
        completedAt,
        startedAt: earlierStartedAt,
      });
      await writeState(productDir, branchSlug, tieBreakerRun, {
        ...baseState,
        status: AUDIT_RUN_STATE_STATUS.FAILED,
        completedAt,
        startedAt: laterStartedAt,
      });

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(selectLatestTerminalAuditRun(result.value.terminalRuns)?.runDirectoryName).toBe(tieBreakerRun);
    });
  });

  it("does not index node-first verdict artifacts for branch run lookup", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());

    await withTempProductDir(async (productDir) => {
      await mkdir(join(productDir, DEFAULT_AUDIT_CONFIG.storage.spxDir, DEFAULT_AUDIT_CONFIG.storage.nodesDir), {
        recursive: true,
      });
      await writeFile(
        join(
          productDir,
          DEFAULT_AUDIT_CONFIG.storage.spxDir,
          DEFAULT_AUDIT_CONFIG.storage.nodesDir,
          DEFAULT_AUDIT_CONFIG.storage.verdictFile,
        ),
        sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName()),
      );

      const result = await readAuditBranchRuns(productDir, branchSlug);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.terminalRuns).toEqual([]);
      expect(result.value.incompleteRuns).toEqual([]);
    });
  });

  it("rejects unnormalized branch slugs before reading branch runs", async () => {
    const invalidBranchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, invalidBranchSlug);

      expect(result).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_BRANCH_SLUG });
    });
  });

  it("keeps node-first verdict artifacts verifiable when supplied as explicit files", async () => {
    const harness = await createAuditHarness();
    const nodePath = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
    const verdictXml = renderAuditVerdictXml({
      specNode: nodePath,
      verdict: AUDIT_VERDICT_VALUE.APPROVED,
      timestamp: formatAuditRunTimestamp(sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate())),
      gates: [
        {
          name: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
          status: AUDIT_GATE_STATUS.PASS,
          findings: [],
        },
      ],
    });

    try {
      const filePath = await harness.writeVerdict(nodePath, verdictXml);

      const result = await runVerifyPipeline(filePath, harness.productDir);

      expect(result.exitCode).toBe(0);
      expect(result.verdict).toBe(AUDIT_VERDICT_VALUE.APPROVED);
    } finally {
      await harness.cleanup();
    }
  });
});
