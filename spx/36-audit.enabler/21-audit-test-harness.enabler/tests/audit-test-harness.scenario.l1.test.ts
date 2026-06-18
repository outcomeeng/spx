/**
 * Scenario tests for the audit test harness: temp-directory creation,
 * branch-run-file directory derivation, run-journal writing, and cleanup.
 *
 * Test Level: l1 — the harness creates temp dirs (fs is l1).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import {
  AUDIT_RUN_STATE_STATUS,
  type AuditRunState,
} from "@/domains/audit/run-state";
import type { JournalEvent } from "@/lib/agent-run-journal";
import {
  STATE_STORE_DOMAIN,
  STATE_STORE_PATH,
  STATE_STORE_TEXT_ENCODING,
} from "@/lib/state-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  auditBranchRunsDir as resolveAuditBranchRunsDir,
  createAuditHarness,
  writeAuditRunJournal,
} from "@testing/harnesses/audit/harness";
import { describe, expect, it } from "vitest";

describe("createAuditHarness", () => {
  it("GIVEN no arguments WHEN created THEN an absolute temp product directory exists", async () => {
    const harness = await createAuditHarness();
    try {
      expect(isAbsolute(harness.productDir)).toBe(true);
      expect(existsSync(harness.productDir)).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a harness WHEN cleanup is called THEN temp dir no longer exists", async () => {
    const harness = await createAuditHarness();
    const dir = harness.productDir;
    expect(existsSync(dir)).toBe(true);

    await harness.cleanup();

    expect(existsSync(dir)).toBe(false);
  });
});

describe("audit branch runs directory helper", () => {
  it("GIVEN a product directory and branch slug WHEN called THEN returns the branch run-file directory", async () => {
    const branchSlug = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const auditRunsDir = join(
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.BRANCH_SCOPE,
      branchSlug,
      STATE_STORE_DOMAIN.AUDIT,
      STATE_STORE_PATH.RUNS_DIR,
    );
    const harness = await createAuditHarness();
    try {
      expect(resolveAuditBranchRunsDir(harness.productDir, branchSlug)).toBe(join(harness.productDir, auditRunsDir));
    } finally {
      await harness.cleanup();
    }
  });
});

describe("writeAuditRunJournal", () => {
  it("GIVEN a terminal state WHEN a run journal is written THEN the run file holds the run's events under the branch runs dir", async () => {
    const branchSlug = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runFileName = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.runFileName());
    const states: readonly AuditRunState[] = [
      {
        ...sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState()),
        status: AUDIT_RUN_STATE_STATUS.APPROVED,
      },
      {
        ...sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.auditRunState()),
        status: AUDIT_RUN_STATE_STATUS.REJECTED,
      },
    ];
    const harness = await createAuditHarness();
    try {
      const runFilePath = await writeAuditRunJournal(harness.productDir, branchSlug, runFileName, states);

      expect(runFilePath).toBe(join(resolveAuditBranchRunsDir(harness.productDir, branchSlug), runFileName));
      const content = await readFile(runFilePath, STATE_STORE_TEXT_ENCODING);
      const events = content.trim().split("\n").map((line) => JSON.parse(line) as JournalEvent);
      expect(events).toHaveLength(states.length);
      for (const [index, event] of events.entries()) {
        expect(event.data).toMatchObject({ status: states[index]?.status });
      }
    } finally {
      await harness.cleanup();
    }
  });
});
