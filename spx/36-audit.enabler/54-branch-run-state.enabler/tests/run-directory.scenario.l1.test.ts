import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AuditRunStateFileSystem,
  createAuditRunDirectory,
  writeTerminalAuditRunState,
} from "@/commands/audit/run-state";
import { DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import { AUDIT_VERDICT_VALUE } from "@/domains/audit/reader";
import {
  AUDIT_RUN_STATE_DISPLAY,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_STATUS,
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
    rename: () => Promise.resolve(),
    readFile: async () => EMPTY_JSON,
    readdir: async () => [],
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

describe("audit run directory storage", () => {
  it("creates branch-scoped run directories under the audit descriptor storage root", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunDirectory(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.runsDir).toBe(auditBranchRunsDir(productDir, branchSlug));
      expect(result.value.runDirectoryName).toBe(`${formatAuditRunTimestamp(startedDate)}-${runId}`);
      expect(result.value.runDir).toBe(join(result.value.runsDir, result.value.runDirectoryName));
    });
  });

  it("retries EEXIST run-id collisions with a fresh run id", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const startedDate = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.timestampDate());
    const firstRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const secondRunId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());

    await withTempProductDir(async (productDir) => {
      const runsDir = auditBranchRunsDir(productDir, branchSlug);
      await mkdir(join(runsDir, `${formatAuditRunTimestamp(startedDate)}-${firstRunId}`), { recursive: true });
      const runIds = [firstRunId, secondRunId];

      const result = await createAuditRunDirectory(productDir, branchSlug, {
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
      const runsDir = auditBranchRunsDir(productDir, branchSlug);
      await mkdir(join(runsDir, `${formatAuditRunTimestamp(startedDate)}-${runId}`), { recursive: true });

      const result = await createAuditRunDirectory(productDir, branchSlug, {
        now: () => startedDate,
        randomBytes: () => bufferFromHex(runId),
        maxAttempts: 1,
      });

      expect(result).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.RUN_DIRECTORY_COLLISION_LIMIT });
    });
  });

  it("returns a typed error when the root run directory cannot be created", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const errorMessage = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunDirectory(productDir, branchSlug, {
        fs: createFailingMkdirFileSystem(errorMessage),
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(result.value.runDir);
      expect(result.error).toContain(AUDIT_RUN_STATE_ERROR.RUN_DIRECTORY_CREATE_FAILED);
      expect(result.error).toContain(errorMessage);
    });
  });

  it("rejects unnormalized branch slugs before constructing storage paths", async () => {
    const invalidBranchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());

    await withTempProductDir(async (productDir) => {
      const result = await createAuditRunDirectory(productDir, invalidBranchSlug);

      expect(result).toEqual({ ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_BRANCH_SLUG });
    });
  });

  it("renders rejected terminal state with the audit verdict vocabulary", () => {
    expect(AUDIT_RUN_STATE_DISPLAY[AUDIT_RUN_STATE_STATUS.REJECTED]).toBe(AUDIT_VERDICT_VALUE.REJECT);
  });

  it("writes terminal state through a same-directory temp file and final state file", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runId = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runId());
    const state = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState());

    await withTempProductDir(async (productDir) => {
      const runDirectory = await createAuditRunDirectory(productDir, branchSlug, {
        randomBytes: () => bufferFromHex(runId),
      });
      expect(runDirectory.ok).toBe(true);
      if (!runDirectory.ok) throw new Error(runDirectory.error);

      const result = await writeTerminalAuditRunState(runDirectory.value.runDir, state, {
        randomBytes: () => bufferFromHex(runId),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value).toBe(join(runDirectory.value.runDir, DEFAULT_AUDIT_CONFIG.storage.stateFile));
      await expect(readFile(result.value, "utf8")).resolves.toContain(state.status);
    });
  });
});
