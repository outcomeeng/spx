import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AuditRunStateFileSystem,
  appendAuditRunEvent,
  createAuditRunFile,
  readAuditRunEvents,
  writeTerminalAuditRunState,
} from "@/commands/audit/run-state";
import {
  AUDIT_RUN_STATE_DISPLAY,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_STATUS,
  auditRunStartedEventInput,
  auditRunFileName,
  formatAuditRunTimestamp,
} from "@/domains/audit/run-state";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { auditBranchRunsDir } from "@testing/harnesses/audit/harness";

function bufferFromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function createFailingMkdirFileSystem(errorMessage: string): AuditRunStateFileSystem {
  return {
    mkdir: async () => {
      throw new Error(errorMessage);
    },
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: async () => EMPTY_JSON,
    readdir: async () => [],
    lstat: async () => ({ isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }),
  };
}

async function withTempProductDir(callback: (productDir: string) => Promise<void>): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  try {
    await callback(productDir);
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

const EMPTY_JSON = "{}";

describe("audit run-file storage", () => {
  it("creates branch-scoped run files under the state-store audit root", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.runsDir).toBe(auditBranchRunsDir(productDir, branchSlug));
      expect(result.value.runToken).toBe(`${formatAuditRunTimestamp(startedDate)}-${runId}`);
      expect(result.value.runFileName).toBe(auditRunFileName(result.value.runToken));
      expect(result.value.runFilePath).toBe(join(result.value.runsDir, result.value.runFileName));
      await expect(readFile(result.value.runFilePath, "utf8")).resolves.toBe("");
    });
  });

  it("retries EEXIST run-id collisions with a fresh run id", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const firstRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const secondRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const firstReservation = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(firstRunId),
      });
      expect(firstReservation.ok).toBe(true);
      const runIds = [firstRunId, secondRunId];

      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runIds.shift() ?? secondRunId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.runId).toBe(secondRunId);
    });
  });

  it("fails before auditor execution when collision retries are exhausted", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const firstReservation = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
      });
      expect(firstReservation.ok).toBe(true);

      const result = await createAuditRunFile(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
        maxAttempts: 1,
      });

      expect(result).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.RUN_FILE_COLLISION_LIMIT });
    });
  });

  it("returns a typed error when the root run-file directory cannot be created", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const errorMessage = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, branchSlug, {
        fs: createFailingMkdirFileSystem(errorMessage),
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(result.value.runFilePath);
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED);
      expect(result.error).toContain(errorMessage);
    });
  });

  it("rejects unnormalized branch slugs before constructing storage paths", async () => {
    const invalidBranchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunFile(productDir, invalidBranchSlug);

      expect(result.ok).toBe(false);
    });
  });

  it("renders rejected terminal state with the audit verdict vocabulary", () => {
    expect(AUDIT_RUN_STATE_DISPLAY[AUDIT_RUN_STATE_STATUS.REJECTED]).toBe("REJECT");
  });

  it("writes terminal state into the reserved JSONL run file", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);

      const result = await writeTerminalAuditRunState(runFile.value.runFilePath, state);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value).toBe(runFile.value.runFilePath);
      await expect(readFile(result.value, "utf8")).resolves.toContain(state.status);
    });
  });

  it("rejects direct run-state access outside branch-scoped audit storage", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);
      const outsideRunFilePath = join(productDir, runFile.value.runFileName);

      const append = await appendAuditRunEvent(
        outsideRunFilePath,
        auditRunStartedEventInput(state, {
          id: runFile.value.runFileName,
          time: state.startedAt,
          attempt: 1,
        }),
      );
      const read = await readAuditRunEvents(outsideRunFilePath);
      const write = await writeTerminalAuditRunState(outsideRunFilePath, state);

      expect(append).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      expect(read).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      expect(write).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH });
      await expect(readFile(outsideRunFilePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("returns a write error when the seal-marker read fails", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const ioError = Object.assign(new Error(errorCode), { code: errorCode });

    await withTempProductDir(async (productDir) => {
      const runFile = await createAuditRunFile(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runFile.ok).toBe(true);
      if (!runFile.ok) throw new Error(runFile.error);

      const failingSealReadFileSystem: AuditRunStateFileSystem = {
        mkdir: () => Promise.resolve(),
        writeFile: () => Promise.resolve(),
        appendFile: () => Promise.resolve(),
        readFile: () => Promise.reject(ioError),
        readdir: () => Promise.resolve([]),
        lstat: (path) => {
          if (path.endsWith(".sealed")) {
            return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
          }
          return Promise.resolve({
            isDirectory: () => !path.endsWith(".jsonl"),
            isFile: () => path.endsWith(".jsonl"),
            isSymbolicLink: () => false,
          });
        },
      };
      const result = await writeTerminalAuditRunState(runFile.value.runFilePath, state, {
        fs: failingSealReadFileSystem,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a write error");
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED);
    });
  });
});
