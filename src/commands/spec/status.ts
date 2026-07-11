import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { createNodeStatusProvider, type NodeOutcomeResolver, updateNodeStatus } from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  projectSpecTree,
  readSpecTree,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSource,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

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

export class SpecStatusUpdateRequiresProductDirError extends Error {
  constructor() {
    super("Cannot update spec status for an injected in-memory source");
    this.name = "SpecStatusUpdateRequiresProductDirError";
  }
}

interface StatusBaseOptions {
  cwd?: string;
  format?: OutputFormat;
  gitDependencies?: GitDependencies;
  onWarning?: SpecProductDirWarningHandler;
  source?: SpecTreeSource;
}

// The read path takes no resolver; the --update path requires one. The injected
// source/update arm keeps the fail-fast path testable while the filesystem update
// arm continues to reject `update: true` without a resolver at compile time.
interface StatusReadOptions extends StatusBaseOptions {
  update?: false;
  resolveOutcomeFor?: never;
}

interface StatusUpdateOptions extends Omit<StatusBaseOptions, "source"> {
  source?: never;
  /** Refresh each node's spx.status.json before reporting the rollup. */
  update: true;
  /** Builds the per-node outcome resolver --update injects. */
  resolveOutcomeFor: (productDir: string) => NodeOutcomeResolver;
}

interface StatusInMemoryUpdateOptions extends StatusBaseOptions {
  source: SpecTreeSource;
  /** Refresh each node's spx.status.json before reporting the rollup. */
  update: true;
  resolveOutcomeFor?: never;
}

export type StatusOptions = StatusReadOptions | StatusUpdateOptions | StatusInMemoryUpdateOptions;

export async function statusCommand(
  options: StatusOptions = {},
): Promise<string> {
  if (options.source !== undefined) {
    if (options.update === true) {
      throw new SpecStatusUpdateRequiresProductDirError();
    }
    // Injected sources are in-memory and carry no productDir, so the node-status
    // read-back provider — which resolves each spx.status.json under productDir —
    // cannot apply here; this path bypasses filesystem and git resolution and
    // derives state live.
    return renderSpecStatus(projectSpecTree(await readSpecTree({ source: options.source })), options.format);
  }

  const gitDependencies = options.gitDependencies ?? defaultGitDependencies;
  const productDir = await resolveSpecProductDir(
    options.cwd ?? CONFIG_PROCESS_CWD.read(),
    gitDependencies,
    options.onWarning,
  );
  if (options.update === true) {
    // --update refreshes each node's spx.status.json before the read-back below, so
    // the reported rollup reflects the just-written state. The resolver and git runner
    // are injected at the command edge; updateNodeStatus restricts writes to git-tracked
    // node directories so a stale, untracked, node-shaped directory is neither written
    // nor retained by the stale-file sweep.
    await updateNodeStatus({ productDir, resolveOutcome: options.resolveOutcomeFor(productDir), gitDependencies });
  }
  // Read-back: a node's committed spx.status.json overrides live derivation; a node
  // with no status file yields undefined, routing the spec-tree library back to live
  // derivation.
  const snapshot = await readSpecTree({
    source: createFilesystemSpecTreeSource({ productDir }),
    evidence: createNodeStatusProvider(productDir),
  });
  return renderSpecStatus(projectSpecTree(snapshot), options.format);
}

export function renderSpecStatus(
  projection: SpecTreeProjection,
  format: OutputFormat = DEFAULT_FORMAT,
): string {
  if (projection.nodes.length === 0 && format !== OUTPUT_FORMAT.JSON) {
    return SPEC_STATUS_MESSAGE.EMPTY;
  }

  switch (format) {
    case OUTPUT_FORMAT.JSON:
      return formatJSON(projection);
    case OUTPUT_FORMAT.MARKDOWN:
      return formatMarkdown(projection);
    case OUTPUT_FORMAT.TABLE:
      return formatTable(projection);
    case OUTPUT_FORMAT.TEXT:
      return formatText(projection);
    default: {
      const unsupportedFormat: never = format;
      throw new RangeError(`Unsupported spec status output format: ${unsupportedFormat}`);
    }
  }
}

function formatJSON(projection: SpecTreeProjection): string {
  return JSON.stringify(projection, null, JSON_INDENTATION);
}

function formatText(projection: SpecTreeProjection): string {
  return projection.nodes.map((node) => formatTextNode(node)).join("\n");
}

function formatTextNode(node: SpecTreeProjectedNode, depth = 0): string {
  const current = `${NODE_INDENT.repeat(depth)}${formatNodeLabel(node)}`;
  const children = node.children.map((child) => formatTextNode(child, depth + 1));
  return [current, ...children].join("\n");
}

function formatMarkdown(projection: SpecTreeProjection): string {
  return projection.nodes.map((node) => formatMarkdownNode(node)).join("\n");
}

function formatMarkdownNode(node: SpecTreeProjectedNode, depth = 0): string {
  const current = `${NODE_INDENT.repeat(depth)}${MARKDOWN_NODE_PREFIX}${formatNodeLabel(node)}`;
  const children = node.children.map((child) => formatMarkdownNode(child, depth + 1));
  return [current, ...children].join("\n");
}

function formatTable(projection: SpecTreeProjection): string {
  const rows = flattenProjectionNodes(projection.nodes).map((node) => [
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

function flattenProjectionNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectionNodes(node.children)]);
}

function formatTableRow(values: readonly string[]): string {
  const separator = ` ${TABLE_SEPARATOR} `;
  return `${TABLE_SEPARATOR} ${values.join(separator)} ${TABLE_SEPARATOR}`;
}

function formatNodeLabel(node: SpecTreeProjectedNode): string {
  return [
    KIND_REGISTRY[node.kind].label,
    node.id,
    `[${node.state}]`,
  ].join(STATUS_SEPARATOR);
}
