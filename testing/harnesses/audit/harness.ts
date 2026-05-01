/**
 * Audit test harness — reusable fixture factory for audit domain tests.
 *
 * Provides temp project-root creation, pre-written verdict XML file
 * construction, and `.spx/nodes/` directory setup. All path values derive
 * from DEFAULT_AUDIT_CONFIG — no hardcoded path separators or directory names.
 *
 * @module audit/testing/harness
 */

import { DEFAULT_AUDIT_CONFIG, encodeNodePath, formatAuditTimestamp } from "@/domains/audit/config";
import { AUDIT_VERDICT_XML, AuditGateStatus, AuditVerdictValue } from "@/domains/audit/reader";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const AUDIT_VERDICT_XML_SKIPPED_REASON_FIXTURE = "Not applicable for this generated gate";

export interface AuditVerdictXmlFindingFixture {
  readonly specFile: string;
  readonly testFile: string;
}

export interface AuditVerdictXmlGateFixture {
  readonly name: string;
  readonly status: AuditGateStatus;
  readonly skippedReason?: string;
  readonly findings: readonly AuditVerdictXmlFindingFixture[];
}

export interface AuditVerdictXmlFixture {
  readonly specNode: string;
  readonly verdict: AuditVerdictValue;
  readonly timestamp: string;
  readonly gates: readonly AuditVerdictXmlGateFixture[];
}

/**
 * Audit test harness interface.
 */
export interface AuditHarness {
  /** Absolute path to the temp directory used as a fake project root. */
  readonly projectRoot: string;

  /**
   * Returns the absolute path to the verdict directory for the given spec
   * node path, derived from DEFAULT_AUDIT_CONFIG and encodeNodePath.
   */
  nodeDir(nodePath: string): string;

  /**
   * Writes an audit verdict XML string to a timestamped file inside the
   * path-encoded node directory, creating the directory if needed.
   *
   * @param now - Optional clock injected for deterministic filename in tests.
   * @returns The absolute path to the created verdict file.
   */
  writeVerdict(nodePath: string, xml: string, now?: () => Date): Promise<string>;

  /** Removes the temp project root and all contents. */
  cleanup(): Promise<void>;
}

/**
 * Creates an audit test harness with a temp directory containing the
 * `.spx/nodes/` subdirectory structure derived from DEFAULT_AUDIT_CONFIG.
 */
export async function createAuditHarness(): Promise<AuditHarness> {
  const projectRoot = await mkdtemp(join(tmpdir(), "spx-audit-harness-"));

  await mkdir(
    join(projectRoot, DEFAULT_AUDIT_CONFIG.spxDir, DEFAULT_AUDIT_CONFIG.nodesSubdir),
    { recursive: true },
  );

  const harness: AuditHarness = {
    projectRoot,

    nodeDir(nodePath: string): string {
      return join(
        projectRoot,
        DEFAULT_AUDIT_CONFIG.spxDir,
        DEFAULT_AUDIT_CONFIG.nodesSubdir,
        encodeNodePath(nodePath),
      );
    },

    async writeVerdict(nodePath: string, xml: string, now?: () => Date): Promise<string> {
      const dir = harness.nodeDir(nodePath);
      await mkdir(dir, { recursive: true });

      const filename = `${formatAuditTimestamp(now)}${DEFAULT_AUDIT_CONFIG.auditSuffix}`;
      const filePath = join(dir, filename);
      await writeFile(filePath, xml);
      return filePath;
    },

    async cleanup(): Promise<void> {
      await rm(projectRoot, { recursive: true, force: true });
    },
  };

  return harness;
}

export function renderAuditVerdictXml(fixture: AuditVerdictXmlFixture): string {
  const gatesXml = fixture.gates.map(renderAuditGateXml).join("\n");

  return `<${AUDIT_VERDICT_XML.ROOT}>
  <${AUDIT_VERDICT_XML.HEADER}>
    <${AUDIT_VERDICT_XML.SPEC_NODE}>${fixture.specNode}</${AUDIT_VERDICT_XML.SPEC_NODE}>
    <${AUDIT_VERDICT_XML.VERDICT}>${fixture.verdict}</${AUDIT_VERDICT_XML.VERDICT}>
    <${AUDIT_VERDICT_XML.TIMESTAMP}>${fixture.timestamp}</${AUDIT_VERDICT_XML.TIMESTAMP}>
  </${AUDIT_VERDICT_XML.HEADER}>
  <${AUDIT_VERDICT_XML.GATES}>
${gatesXml}
  </${AUDIT_VERDICT_XML.GATES}>
</${AUDIT_VERDICT_XML.ROOT}>`;
}

function renderAuditGateXml(gate: AuditVerdictXmlGateFixture): string {
  const findingsXml = gate.findings.map(renderAuditFindingXml).join("\n");
  const skippedReasonElement = gate.skippedReason === undefined
    ? ""
    : `
      <${AUDIT_VERDICT_XML.SKIPPED_REASON}>${gate.skippedReason}</${AUDIT_VERDICT_XML.SKIPPED_REASON}>`;
  const findingsElement = gate.findings.length === 0
    ? `<${AUDIT_VERDICT_XML.FINDINGS} ${AUDIT_VERDICT_XML.COUNT}="${gate.findings.length}"/>`
    : `<${AUDIT_VERDICT_XML.FINDINGS} ${AUDIT_VERDICT_XML.COUNT}="${gate.findings.length}">
${findingsXml}
      </${AUDIT_VERDICT_XML.FINDINGS}>`;

  return `    <${AUDIT_VERDICT_XML.GATE}>
      <${AUDIT_VERDICT_XML.NAME}>${gate.name}</${AUDIT_VERDICT_XML.NAME}>
      <${AUDIT_VERDICT_XML.STATUS}>${gate.status}</${AUDIT_VERDICT_XML.STATUS}>
      ${skippedReasonElement}
      ${findingsElement}
    </${AUDIT_VERDICT_XML.GATE}>`;
}

function renderAuditFindingXml(finding: AuditVerdictXmlFindingFixture): string {
  return `        <${AUDIT_VERDICT_XML.FINDING}>
          <${AUDIT_VERDICT_XML.SPEC_FILE}>${finding.specFile}</${AUDIT_VERDICT_XML.SPEC_FILE}>
          <${AUDIT_VERDICT_XML.TEST_FILE}>${finding.testFile}</${AUDIT_VERDICT_XML.TEST_FILE}>
        </${AUDIT_VERDICT_XML.FINDING}>`;
}
