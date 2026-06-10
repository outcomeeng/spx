/**
 * Scenario tests for verdict reader.
 *
 * Test Level: 1 (Unit)
 * - Pure XML parsing plus command-level file I/O via real temp dirs
 *
 * Assertions covered from verdict-reader.md:
 * - S1: Non-well-formed XML content → throws error identifying the source label
 * - S2: Missing file path → command loader throws error naming the missing path
 */

import { readVerdictFile } from "@/commands/audit/reader";
import { DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import { AUDIT_VERDICT_XML, parseAuditVerdictXml } from "@/domains/audit/reader";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { createAuditHarness } from "@testing/harnesses/audit/harness";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function malformedVerdictXml(): string {
  return `<${AUDIT_VERDICT_XML.ROOT}>`;
}

describe("verdict reader error scenarios", () => {
  it("GIVEN XML content that is not well formed WHEN the parser runs THEN throws an error identifying the source label", () => {
    const sourceLabel = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    expect(() => parseAuditVerdictXml(malformedVerdictXml(), sourceLabel)).toThrow(sourceLabel);
  });

  it("GIVEN a file path that does not exist WHEN the command loader reads it THEN throws an error naming the missing path", async () => {
    const harness = await createAuditHarness();
    try {
      const missingPath = join(harness.productDir, DEFAULT_AUDIT_CONFIG.storage.verdictFile);
      await expect(readVerdictFile(missingPath)).rejects.toThrow(missingPath);
    } finally {
      await harness.cleanup();
    }
  });
});
