import { DEFAULT_CONFIG } from "@/config/defaults";
import { formatJSON } from "@/lib/spec-legacy/reporter/json";
import { formatMarkdown } from "@/lib/spec-legacy/reporter/markdown";
import { formatTable } from "@/lib/spec-legacy/reporter/table";
import { formatText } from "@/lib/spec-legacy/reporter/text";
import { Scanner } from "@/lib/spec-legacy/scanner/scanner";
import { buildTree } from "@/lib/spec-legacy/tree/build";

export const OUTPUT_FORMAT = {
  TEXT: "text",
  JSON: "json",
  MARKDOWN: "markdown",
  TABLE: "table",
} as const;

const DEFAULT_FORMAT: OutputFormat = OUTPUT_FORMAT.TEXT;

export type OutputFormat = (typeof OUTPUT_FORMAT)[keyof typeof OUTPUT_FORMAT];

export interface StatusOptions {
  cwd?: string;
  format?: OutputFormat;
}

function buildMissingDirectoryMessage(): string {
  const {
    root,
    work: {
      dir,
      statusDirs: { doing },
    },
  } = DEFAULT_CONFIG.specs;

  return `Directory ${root}/${dir}/${doing} not found.`;
}

export async function statusCommand(
  options: StatusOptions = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const format = options.format ?? DEFAULT_FORMAT;
  const scanner = new Scanner(cwd, DEFAULT_CONFIG);

  let workItems;
  try {
    workItems = await scanner.scan();
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new Error(buildMissingDirectoryMessage());
    }

    throw error;
  }

  if (workItems.length === 0) {
    return "No work items found in specs/work/doing";
  }

  const tree = await buildTree(workItems);

  switch (format) {
    case OUTPUT_FORMAT.JSON:
      return formatJSON(tree, DEFAULT_CONFIG);
    case OUTPUT_FORMAT.MARKDOWN:
      return formatMarkdown(tree);
    case OUTPUT_FORMAT.TABLE:
      return formatTable(tree);
    case OUTPUT_FORMAT.TEXT:
      return formatText(tree);
  }
}
