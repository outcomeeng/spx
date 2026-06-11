/**
 * Scenario tests for the audit test harness: temp-directory creation, node-path
 * encoding, verdict writing, branch-run-file directory derivation, and cleanup.
 *
 * Test Level: l1 — the harness creates temp dirs (fs is l1).
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

import { DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import { STATE_STORE_DOMAIN, STATE_STORE_PATH } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { auditBranchRunsDir, createAuditHarness } from "@testing/harnesses/audit/harness";
import { describe, expect, it } from "vitest";

const AUDIT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.audit\.xml$/;

const NODES_DIR = join(DEFAULT_AUDIT_CONFIG.storage.spxDir, DEFAULT_AUDIT_CONFIG.storage.nodesDir);

describe("createAuditHarness", () => {
  it("GIVEN no arguments WHEN created THEN temp product directory exists with .spx/nodes/ directory", async () => {
    const harness = await createAuditHarness();
    try {
      const nodesDir = join(harness.productDir, NODES_DIR);
      const dirStat = await stat(nodesDir);
      expect(dirStat.isDirectory()).toBe(true);
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

describe("nodeDir", () => {
  it("GIVEN a spec node path WHEN nodeDir is called THEN returns .spx/nodes/ joined with / replaced by -", async () => {
    const harness = await createAuditHarness();
    try {
      const nodePath = "spx/36-audit.enabler/21-audit-test-harness.enabler";
      const expected = join(harness.productDir, NODES_DIR, "spx-36-audit.enabler-21-audit-test-harness.enabler");

      expect(harness.nodeDir(nodePath)).toBe(expected);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a spec node path WHEN nodeDir is called THEN returns an absolute path", async () => {
    const harness = await createAuditHarness();
    try {
      expect(isAbsolute(harness.nodeDir("spx/36-audit.enabler"))).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});

describe("auditBranchRunsDir", () => {
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
      expect(auditBranchRunsDir(harness.productDir, branchSlug)).toBe(join(harness.productDir, auditRunsDir));
    } finally {
      await harness.cleanup();
    }
  });
});

describe("writeVerdict", () => {
  it("GIVEN a node path and XML WHEN writeVerdict is called THEN file exists in node directory with timestamp-pattern name", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("spx/36-audit.enabler", "<audit_verdict/>");

      expect(isAbsolute(filePath)).toBe(true);
      expect(AUDIT_TIMESTAMP_PATTERN.test(basename(filePath))).toBe(true);

      const fileStat = await stat(filePath);
      expect(fileStat.isFile()).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a node path WHEN writeVerdict is called THEN returned path is inside nodeDir for that path", async () => {
    const harness = await createAuditHarness();
    try {
      const nodePath = "spx/36-audit.enabler";
      const filePath = await harness.writeVerdict(nodePath, "<audit_verdict/>");

      expect(filePath.startsWith(harness.nodeDir(nodePath))).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN XML content WHEN writeVerdict is called THEN file content matches the XML string", async () => {
    const harness = await createAuditHarness();
    try {
      const xml = "<audit_verdict><header><verdict>APPROVED</verdict></header></audit_verdict>";
      const filePath = await harness.writeVerdict("spx/36-audit.enabler", xml);
      const content = await readFile(filePath, "utf-8");

      expect(content).toBe(xml);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN an injectable clock WHEN writeVerdict is called THEN filename matches the injected timestamp", async () => {
    const harness = await createAuditHarness();
    try {
      const fixedDate = new Date("2024-06-15T10:30:45.000Z");
      const now = () => fixedDate;
      const filePath = await harness.writeVerdict("spx/36-audit.enabler", "<audit_verdict/>", now);
      const expectedFilename = `2024-06-15_10-30-45${DEFAULT_AUDIT_CONFIG.storage.verdictFileSuffix}`;

      expect(basename(filePath)).toBe(expectedFilename);
    } finally {
      await harness.cleanup();
    }
  });
});
