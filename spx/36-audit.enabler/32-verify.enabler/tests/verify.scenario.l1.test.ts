/**
 * Scenario and mapping tests for the verify pipeline.
 *
 * Test Level: 1 (Unit)
 * - Uses AuditHarness and temp directories; no external infrastructure
 *
 * Assertions covered from verify.md:
 * - S1: Well-formed, coherent XML → all stages pass → exitCode 0, no lines
 * - S2: Structural failure → "structural:" lines in output, no "semantic:" or "paths:" lines
 * - S3: Semantic failure → "semantic:" lines in output, no "paths:" lines
 * - S4: Path failure → "paths:" lines in output, exitCode 1
 * - S5: Verdict file outside .spx/nodes/ → processes normally, exitCode 0
 * - M1: For each stage with defects, all subsequent stage names are absent from output
 * - C1: Each defect line conforms to "{stage}: {message}" format
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditHarness } from "@/audit/testing/harness";
import type { AuditHarness } from "@/audit/testing/harness";
import { runVerifyPipeline } from "@/audit/verify";

const LINE_FORMAT = /^(reader|structural|semantic|paths): /;
const VERIFY_STAGE = {
  READER: "reader",
  STRUCTURAL: "structural",
  SEMANTIC: "semantic",
  PATHS: "paths",
} as const;
type VerifyStage = (typeof VERIFY_STAGE)[keyof typeof VERIFY_STAGE];

const XML_ALL_PASS = `<audit_verdict>
  <header>
    <spec_node>spx/36-audit.enabler</spec_node>
    <verdict>APPROVED</verdict>
    <timestamp>2024-01-01_00-00-00</timestamp>
  </header>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
  </gates>
</audit_verdict>`;

const XML_MISSING_HEADER = `<audit_verdict>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
  </gates>
</audit_verdict>`;

const XML_SEMANTIC_FAIL = `<audit_verdict>
  <header>
    <spec_node>spx/36-audit.enabler</spec_node>
    <verdict>APPROVED</verdict>
    <timestamp>2024-01-01_00-00-00</timestamp>
  </header>
  <gates>
    <gate>
      <name>tests</name>
      <status>FAIL</status>
      <findings count="1">
        <finding>
          <spec_file>spx/test/spec.md</spec_file>
          <test_file>spx/test/tests/test.ts</test_file>
        </finding>
      </findings>
    </gate>
  </gates>
</audit_verdict>`;

const XML_PATHS_FAIL = `<audit_verdict>
  <header>
    <spec_node>spx/36-audit.enabler</spec_node>
    <verdict>REJECT</verdict>
    <timestamp>2024-01-01_00-00-00</timestamp>
  </header>
  <gates>
    <gate>
      <name>tests</name>
      <status>FAIL</status>
      <findings count="1">
        <finding>
          <spec_file>nonexistent/spec.md</spec_file>
          <test_file>nonexistent/test.ts</test_file>
        </finding>
      </findings>
    </gate>
  </gates>
</audit_verdict>`;

describe("runVerifyPipeline: scenarios", () => {
  let harness: AuditHarness;

  beforeEach(async () => {
    harness = await createAuditHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN a well-formed audit verdict XML with coherent gate statuses WHEN the verify pipeline runs THEN all stages pass and exitCode is 0", async () => {
    const filePath = await harness.writeVerdict("test/node", XML_ALL_PASS);

    const result = await runVerifyPipeline(filePath, harness.projectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it("GIVEN an audit verdict XML that fails structural validation WHEN the verify pipeline runs THEN structural defects appear and no semantic or paths lines are present", async () => {
    const filePath = await harness.writeVerdict("test/node", XML_MISSING_HEADER);

    const result = await runVerifyPipeline(filePath, harness.projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.lines.some((l) => l.startsWith("structural:"))).toBe(true);
    expect(result.lines.some((l) => l.startsWith("semantic:"))).toBe(false);
    expect(result.lines.some((l) => l.startsWith("paths:"))).toBe(false);
  });

  it("GIVEN an audit verdict that passes structural validation but fails semantic validation WHEN the verify pipeline runs THEN semantic defects appear and no paths lines are present", async () => {
    const filePath = await harness.writeVerdict("test/node", XML_SEMANTIC_FAIL);

    const result = await runVerifyPipeline(filePath, harness.projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.lines.some((l) => l.startsWith("semantic:"))).toBe(true);
    expect(result.lines.some((l) => l.startsWith("paths:"))).toBe(false);
  });

  it("GIVEN an audit verdict whose paths reference non-existent files WHEN the verify pipeline runs THEN path defects are reported and exitCode is 1", async () => {
    const filePath = await harness.writeVerdict("test/node", XML_PATHS_FAIL);

    const result = await runVerifyPipeline(filePath, harness.projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.lines.some((l) => l.startsWith("paths:"))).toBe(true);
  });

  it("GIVEN a verdict XML file located outside .spx/nodes/ WHEN the verify pipeline runs with a valid verdict THEN it processes normally and exitCode is 0", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "spx-verify-test-"));
    try {
      const filePath = join(tempDir, "verdict.xml");
      await writeFile(filePath, XML_ALL_PASS);
      await mkdir(join(tempDir, ".spx", "nodes"), { recursive: true });

      const result = await runVerifyPipeline(filePath, tempDir);

      expect(result.exitCode).toBe(0);
      expect(result.lines).toHaveLength(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("runVerifyPipeline: sequential stop mapping (M1)", () => {
  const STAGE_FAILURE_CASES: Array<{
    label: string;
    xml: string;
    failingStage: VerifyStage;
    absentStages: readonly VerifyStage[];
  }> = [
    {
      label: "structural failure",
      xml: XML_MISSING_HEADER,
      failingStage: VERIFY_STAGE.STRUCTURAL,
      absentStages: [VERIFY_STAGE.SEMANTIC, VERIFY_STAGE.PATHS],
    },
    {
      label: "semantic failure",
      xml: XML_SEMANTIC_FAIL,
      failingStage: VERIFY_STAGE.SEMANTIC,
      absentStages: [VERIFY_STAGE.PATHS],
    },
    {
      label: "paths failure",
      xml: XML_PATHS_FAIL,
      failingStage: VERIFY_STAGE.PATHS,
      absentStages: [],
    },
  ];

  it.each(STAGE_FAILURE_CASES)(
    "GIVEN $label WHEN the verify pipeline runs THEN $failingStage defects appear and subsequent stages are absent",
    async ({ xml, failingStage, absentStages }) => {
      const harness = await createAuditHarness();
      try {
        const filePath = await harness.writeVerdict("test/node", xml);

        const result = await runVerifyPipeline(filePath, harness.projectRoot);

        expect(result.lines.some((l) => l.startsWith(`${failingStage}:`))).toBe(true);
        for (const stage of absentStages) {
          expect(result.lines.some((l) => l.startsWith(`${stage}:`))).toBe(false);
        }
      } finally {
        await harness.cleanup();
      }
    },
  );
});

describe("runVerifyPipeline: defect line format conformance (C1)", () => {
  it("GIVEN any stage produces defects WHEN the verify pipeline runs THEN each defect line matches '{stage}: {message}' format", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", XML_MISSING_HEADER);

      const result = await runVerifyPipeline(filePath, harness.projectRoot);

      expect(result.lines.length).toBeGreaterThan(0);
      for (const line of result.lines) {
        expect(line).toMatch(LINE_FORMAT);
      }
    } finally {
      await harness.cleanup();
    }
  });
});
