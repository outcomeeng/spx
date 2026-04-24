import { DEFAULT_CONFIG } from "@/config/defaults.js";
import { formatJSON } from "@/reporter/json.js";
import { formatMarkdown } from "@/reporter/markdown.js";
import { formatTable } from "@/reporter/table.js";
import { formatText } from "@/reporter/text.js";
import { Scanner } from "@/scanner/scanner.js";
import { buildTree } from "@/tree/build.js";

const DEFAULT_FORMAT: OutputFormat = "text";

export type OutputFormat = "text" | "json" | "markdown" | "table";

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
    case "json":
      return formatJSON(tree, DEFAULT_CONFIG);
    case "markdown":
      return formatMarkdown(tree);
    case "table":
      return formatTable(tree);
    case "text":
      return formatText(tree);
  }
}
