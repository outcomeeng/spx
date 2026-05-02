import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { IGNORE_SOURCE_FILENAME_DEFAULT, type IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export {
  arbNestedNodeSegment,
  arbNodeSegment,
  arbSubpath,
  PROPERTY_NUM_RUNS,
} from "@testing/harnesses/spec-tree/generators";

export const INTEGRATION_CONFIG: Config = {
  specTree: {
    kinds: {
      enabler: { category: "node", suffix: ".enabler" },
      outcome: { category: "node", suffix: ".outcome" },
      adr: { category: "decision", suffix: ".adr.md" },
      pdr: { category: "decision", suffix: ".pdr.md" },
    },
  },
};

export const SPX_ROOT_SEGMENT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const IGNORE_SOURCE_FILENAME = IGNORE_SOURCE_FILENAME_DEFAULT;
export const EXCLUDE_FILENAME = `${SPX_ROOT_SEGMENT}/${IGNORE_SOURCE_FILENAME}`;

export const READER_CONFIG: IgnoreSourceReaderConfig = {
  ignoreSourceFilename: IGNORE_SOURCE_FILENAME,
  specTreeRootSegment: SPX_ROOT_SEGMENT,
};

export const COMMENT_HEADER = "# header comment";
export const COMMENT_INDENTED = "  # indented comment";
export const COMMENT_MIDDLE = "# middle comment";

export const INVALID_EXCLUDE_ENTRIES = [
  "/absolute/node.enabler",
  "../outside-spx",
  "21-example.enabler/../escape",
  "./21-example.enabler",
  "21-example.enabler/../..",
  "21-example.enabler//nested.enabler",
  "21-example.enabler/",
] as const;

export const ARBITRARY_SEGMENT_MAX = 3;
export const ARBITRARY_QUERY_MAX = 4;

export function spxPath(segment: string, ...rest: string[]): string {
  return [SPX_ROOT_SEGMENT, segment, ...rest].join("/");
}

export function excludeContents(lines: readonly string[]): string {
  return lines.join("\n");
}

export async function writeExclude(env: SpecTreeEnv, lines: readonly string[]): Promise<void> {
  await env.writeRaw(EXCLUDE_FILENAME, excludeContents(lines));
}

export async function writeExcludeRaw(env: SpecTreeEnv, contents: string): Promise<void> {
  await env.writeRaw(EXCLUDE_FILENAME, contents);
}
