/**
 * Audit test harness — reusable fixture factory for audit domain tests.
 *
 * Provides temp project-root creation, pre-written verdict XML file
 * construction, and `.spx/nodes/` directory setup. All path values derive
 * from DEFAULT_AUDIT_CONFIG — no hardcoded path separators or directory names.
 *
 * @module audit/testing/harness
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_AUDIT_CONFIG, encodeNodePath, formatAuditTimestamp } from "../config.js";

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
