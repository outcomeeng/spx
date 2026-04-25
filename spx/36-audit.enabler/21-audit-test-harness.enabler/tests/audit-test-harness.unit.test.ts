/**
 * Unit tests for audit test harness.
 *
 * Test Level: 1 (Unit)
 * - Harness creates temp dirs (fs is Level 1)
 * - Verifies directory structure, file writing, cleanup
 *
 * Assertions covered from audit-test-harness.md:
 * - S1: createAuditHarness creates temp project root with .spx/nodes/ directory
 * - S2: nodeDir(nodePath) returns .spx/nodes/ joined with encoded node path (/ → -)
 * - S3: writeVerdict creates {YYYY-MM-DD_HH-mm-ss}.audit.xml in node directory
 * - S3a: writeVerdict accepts injectable clock for deterministic filename
 * - S4: cleanup removes temp dir
 * - P1: nodeDir is deterministic for all spec node path strings
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_AUDIT_CONFIG, encodeNodePath } from "@/audit/config";
import { createAuditHarness } from "@/audit/testing/harness";

const AUDIT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.audit\.xml$/;

const NODES_DIR = join(DEFAULT_AUDIT_CONFIG.spxDir, DEFAULT_AUDIT_CONFIG.nodesSubdir);

describe("createAuditHarness", () => {
  it("GIVEN no arguments WHEN created THEN temp project root exists with .spx/nodes/ directory", async () => {
    const harness = await createAuditHarness();
    try {
      const nodesDir = join(harness.projectRoot, NODES_DIR);
      const dirStat = await stat(nodesDir);
      expect(dirStat.isDirectory()).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a harness WHEN cleanup is called THEN temp dir no longer exists", async () => {
    const harness = await createAuditHarness();
    const dir = harness.projectRoot;
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
      const expected = join(harness.projectRoot, NODES_DIR, encodeNodePath(nodePath));

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

  it("GIVEN any spec node path string WHEN nodeDir is called twice THEN both calls return the same path", async () => {
    // Real bug class: encoding uses stateful counter, Date.now(), or random — all
    // produce non-repeatable output and would fail this property.
    const harness = await createAuditHarness();
    try {
      const segmentArb = fc.stringMatching(/^[a-z][a-z0-9\-.]{1,20}$/);
      const pathArb = fc
        .array(segmentArb, { minLength: 1, maxLength: 5 })
        .map((segs) => segs.join("/"));

      fc.assert(
        fc.property(pathArb, (nodePath) => {
          return harness.nodeDir(nodePath) === harness.nodeDir(nodePath);
        }),
      );
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

      expect(basename(filePath)).toBe("2024-06-15_10-30-45.audit.xml");
    } finally {
      await harness.cleanup();
    }
  });
});
