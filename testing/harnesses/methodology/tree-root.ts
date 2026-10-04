/**
 * Temp directories standing in for spx's `methodology/` directory: each
 * supplied line carries a tree per coding agent and an optional source
 * record, so tree reads, provider checks, and diagnose probes run over a
 * real filesystem shaped like the shipped layout.
 *
 * @module harnesses/methodology/tree-root
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  formatMethodologySourceRecord,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_PLUGIN_NAME,
  type MethodologySourceRecord,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const MANIFEST_PLACEHOLDER = "{}";

/** What a temp tree root carries per line: the coding agents with a tree, and an optional source record. */
export interface ShippedLineLayout {
  readonly codingAgents: readonly string[];
  readonly sourceRecord?: MethodologySourceRecord;
}

/** Materializes a temp directory standing in for spx's `methodology/` directory with the supplied lines. */
export async function withShippedTreeRoot(
  layout: Readonly<Record<string, ShippedLineLayout>>,
  callback: (treeRoot: string) => Promise<void>,
): Promise<void> {
  await withTempDir("spx-methodology-tree-root-", async (treeRoot) => {
    for (const [line, lineLayout] of Object.entries(layout)) {
      await mkdir(join(treeRoot, line), { recursive: true });
      for (const codingAgent of lineLayout.codingAgents) {
        const manifestPath = join(
          treeRoot,
          line,
          codingAgent,
          FOUNDATION_PLUGIN_NAME,
          FOUNDATION_MANIFEST_RELATIVE_PATH,
        );
        await mkdir(join(manifestPath, ".."), { recursive: true });
        await writeFile(manifestPath, MANIFEST_PLACEHOLDER);
      }
      if (lineLayout.sourceRecord !== undefined) {
        await writeFile(
          join(treeRoot, line, SOURCE_RECORD_RELATIVE_PATH),
          formatMethodologySourceRecord(lineLayout.sourceRecord),
        );
      }
    }
    await callback(treeRoot);
  });
}
