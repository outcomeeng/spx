import {
  createFilesystemSpecTreeSource,
  projectSpecTree,
  readSpecTree,
  type SpecTreeNode,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
  type SpecTreeSource,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export const OUTPUT_FORMAT = {
  TEXT: "text",
  JSON: "json",
  MARKDOWN: "markdown",
  TABLE: "table",
} as const;

export const SPEC_STATUS_MESSAGE = {
  EMPTY: `No spec-tree nodes found in ${SPEC_TREE_CONFIG.ROOT_DIRECTORY}`,
} as const;

const DEFAULT_FORMAT: OutputFormat = OUTPUT_FORMAT.TEXT;
const JSON_INDENTATION = 2;
const STATUS_SEPARATOR = " ";
const NODE_INDENT = "  ";
const MARKDOWN_NODE_PREFIX = "- ";
const TABLE_SEPARATOR = "|";
const TABLE_HEADER_SEPARATOR = "---";
const TABLE_HEADER = {
  KIND: "Kind",
  PATH: "Path",
  STATE: "State",
} as const;
export const SPEC_STATUS_TABLE_HEADER = formatTableRow([
  TABLE_HEADER.KIND,
  TABLE_HEADER.PATH,
  TABLE_HEADER.STATE,
]);

export type OutputFormat = (typeof OUTPUT_FORMAT)[keyof typeof OUTPUT_FORMAT];

export interface StatusOptions {
  cwd?: string;
  format?: OutputFormat;
  source?: SpecTreeSource;
}

export async function statusCommand(
  options: StatusOptions = {},
): Promise<string> {
  const snapshot = await readCommandSnapshot(options);

  if (snapshot.allNodes.length === 0) {
    return SPEC_STATUS_MESSAGE.EMPTY;
  }

  switch (options.format ?? DEFAULT_FORMAT) {
    case OUTPUT_FORMAT.JSON:
      return formatJSON(projectSpecTree(snapshot));
    case OUTPUT_FORMAT.MARKDOWN:
      return formatMarkdown(snapshot);
    case OUTPUT_FORMAT.TABLE:
      return formatTable(snapshot);
    case OUTPUT_FORMAT.TEXT:
      return formatText(snapshot);
  }
}

async function readCommandSnapshot(options: StatusOptions): Promise<SpecTreeSnapshot> {
  const productDir = options.cwd ?? process.cwd();
  const source = options.source ?? createFilesystemSpecTreeSource({ productDir });
  return readSpecTree({ source });
}

function formatJSON(projection: SpecTreeProjection): string {
  return JSON.stringify(projection, null, JSON_INDENTATION);
}

function formatText(snapshot: SpecTreeSnapshot): string {
  return snapshot.nodes.map((node) => formatTextNode(node)).join("\n");
}

function formatTextNode(node: SpecTreeNode, depth = 0): string {
  const current = `${NODE_INDENT.repeat(depth)}${formatNodeLabel(node)}`;
  const children = node.children.map((child) => formatTextNode(child, depth + 1));
  return [current, ...children].join("\n");
}

function formatMarkdown(snapshot: SpecTreeSnapshot): string {
  return snapshot.nodes.map((node) => formatMarkdownNode(node)).join("\n");
}

function formatMarkdownNode(node: SpecTreeNode, depth = 0): string {
  const current = `${NODE_INDENT.repeat(depth)}${MARKDOWN_NODE_PREFIX}${formatNodeLabel(node)}`;
  const children = node.children.map((child) => formatMarkdownNode(child, depth + 1));
  return [current, ...children].join("\n");
}

function formatTable(snapshot: SpecTreeSnapshot): string {
  const rows = snapshot.allNodes.map((node) => [
    KIND_REGISTRY[node.kind].label,
    node.id,
    node.state,
  ]);
  return [
    SPEC_STATUS_TABLE_HEADER,
    formatTableRow([TABLE_HEADER_SEPARATOR, TABLE_HEADER_SEPARATOR, TABLE_HEADER_SEPARATOR]),
    ...rows.map(formatTableRow),
  ].join("\n");
}

function formatTableRow(values: readonly string[]): string {
  return `${TABLE_SEPARATOR} ${values.join(` ${TABLE_SEPARATOR} `)} ${TABLE_SEPARATOR}`;
}

function formatNodeLabel(node: SpecTreeNode): string {
  return [
    KIND_REGISTRY[node.kind].label,
    node.id,
    `[${node.state}]`,
  ].join(STATUS_SEPARATOR);
}
