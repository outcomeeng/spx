/**
 * Scenario tests for verdict reader.
 *
 * Test Level: 1 (Unit)
 * - File I/O via real temp dirs (acceptable at l1)
 * - Uses AuditHarness for temp file creation
 *
 * Assertions covered from verdict-reader.md:
 * - S1: Non-well-formed XML → throws error identifying the file
 * - S2: Missing file path → throws error naming the missing path
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readVerdictFile } from "@/audit/reader";
import { createAuditHarness } from "@/audit/testing/harness";

describe("readVerdictFile: error scenarios", () => {
  it("GIVEN a file that is not well-formed XML WHEN the reader parses it THEN throws an error identifying the file", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", "<unclosed-tag>");
      await expect(readVerdictFile(filePath)).rejects.toThrow(filePath);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a file path that does not exist WHEN the reader reads it THEN throws an error naming the missing path", async () => {
    const harness = await createAuditHarness();
    try {
      const missingPath = join(harness.projectRoot, "nonexistent-verdict.xml");
      await expect(readVerdictFile(missingPath)).rejects.toThrow(missingPath);
    } finally {
      await harness.cleanup();
    }
  });
});
