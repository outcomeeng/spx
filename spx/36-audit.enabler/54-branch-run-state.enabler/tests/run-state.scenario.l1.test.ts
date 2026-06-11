import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type AuditRunStateFileSystem, readAuditBranchRuns } from "@/commands/audit/run-state";
import { runVerifyFilePipeline } from "@/commands/audit/verify";
import { DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE } from "@/domains/audit/reader";
import { STATE_STORE_ERROR } from "@/lib/state-store";
import {
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  AUDIT_RUN_STATE_STATUS,
  formatAuditRunTimestamp,
  selectLatestTerminalAuditRun,
} from "@/domains/audit/run-state";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { auditBranchRunsDir, createAuditHarness, renderAuditVerdictXml } from "@testing/harnesses/audit/harness";

async function writeState(
  productDir: string,
  branchSlug: string,
  runFileName: string,
  state: unknown,
): Promise<void> {
  const runsDir = auditBranchRunsDir(productDir, branchSlug);
  await mkdir(runsDir, { recursive: true });
  await writeFile(join(runsDir, runFileName), `${JSON.stringify(state)}\n`);
}

async function withTempProductDir(callback: (productDir: string) => Promise<void>): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  try {
    await callback(productDir);
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

const RUN_FILE_NAME = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());

function createReadFailingFileSystem(error: Error & { readonly code: string }): AuditRunStateFileSystem {
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: async () => {
      throw error;
    },
    readdir: async () => [
      {
        name: RUN_FILE_NAME,
        isFile: () => true,
      },
    ],
  };
}

function createRecordingReadFileSystem(
  entries: readonly string[],
  state: unknown,
  readPaths: string[],
): AuditRunStateFileSystem {
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: async (path) => {
      readPaths.push(path);
      return JSON.stringify(state);
    },
    readdir: async () =>
      entries.map((name) => ({
        name,
        isFile: () => true,
      })),
  };
}

describe("audit branch run-state lookup", () => {
  it("classifies missing, parse-invalid, and shape-invalid run files as incomplete evidence", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const missingRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const partialRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const invalidRun = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const missingError = Object.assign(new Error("missing"), { code: "ENOENT" });

    await withTempProductDir(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, branchSlug, {
        fs: {
          mkdir: () => Promise.resolve(),
          writeFile: () => Promise.resolve(),
          appendFile: () => Promise.resolve(),
          readdir: async () => [
            { name: missingRun, isFile: () => true },
            { name: partialRun, isFile: () => true },
            { name: invalidRun, isFile: () => true },
          ],
          readFile: async (path) => {
            if (path.endsWith(missingRun)) throw missingError;
            if (path.endsWith(partialRun)) return "{";
            return JSON.stringify({
              ...sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState()),
              status: sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName()),
            });
          },
        },
      });

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
          runFileName: RUN_FILE_NAME,
          runFilePath: join(auditBranchRunsDir(productDir, branchSlug), RUN_FILE_NAME),
          reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
          error: errorCode,
        },
      ]);
    });
  });

  it("ignores entries that are not audit run files before reading state", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const invalidEntryName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
    const validRunFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const readPaths: string[] = [];

    await withTempProductDir(async (productDir) => {
      const result = await readAuditBranchRuns(productDir, branchSlug, {
        fs: createRecordingReadFileSystem([invalidEntryName, validRunFileName], state, readPaths),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.incompleteRuns).toEqual([]);
      expect(result.value.terminalRuns.map((run) => run.runFileName)).toEqual([validRunFileName]);
      expect(readPaths).toEqual([
        join(auditBranchRunsDir(productDir, branchSlug), validRunFileName),
      ]);
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
      expect(selectLatestTerminalAuditRun(result.value.terminalRuns)?.runFileName).toBe(tieBreakerRun);
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

      expect(result).toEqual({ ok: false, error: STATE_STORE_ERROR.INVALID_BRANCH_SLUG });
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

      const result = await runVerifyFilePipeline(filePath, harness.productDir);

      expect(result.exitCode).toBe(0);
      expect(result.verdict).toBe(AUDIT_VERDICT_VALUE.APPROVED);
    } finally {
      await harness.cleanup();
    }
  });
});
