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
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
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
/** The product's own line structure between projected status lines. */
const STATUS_LINE_SEPARATOR = "\n";
const TABLE_HEADER_SEPARATOR = "---";
const TABLE_HEADER = {
  KIND: "Kind",
  PATH: "Path",
  STATE: "State",
} as const;
export const SPEC_STATUS_TABLE_HEADER = formatTableRow([
  authoredText(TABLE_HEADER.KIND),
  authoredText(TABLE_HEADER.PATH),
  authoredText(TABLE_HEADER.STATE),
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
): Promise<TerminalText> {
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
): TerminalText {
  if (projection.nodes.length === 0 && format !== OUTPUT_FORMAT.JSON) {
    return authoredText(SPEC_STATUS_MESSAGE.EMPTY);
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

/**
 * The `--json` channel is machine-destined: `JSON.stringify` escapes control bytes inside string
 * values, which is that channel's safety contract, so the serialized document is authored as-is
 * rather than escaped a second time.
 */
function formatJSON(projection: SpecTreeProjection): TerminalText {
  return authoredText(JSON.stringify(projection, null, JSON_INDENTATION));
}

function formatText(projection: SpecTreeProjection): TerminalText {
  return joinTerminalText(STATUS_LINE_SEPARATOR, projection.nodes.map((node) => formatTextNode(node)));
}

function formatTextNode(node: SpecTreeProjectedNode, depth = 0): TerminalText {
  const current = terminal`${authoredText(NODE_INDENT.repeat(depth))}${formatNodeLabel(node)}`;
  const children = node.children.map((child) => formatTextNode(child, depth + 1));
  return joinTerminalText(STATUS_LINE_SEPARATOR, [current, ...children]);
}

function formatMarkdown(projection: SpecTreeProjection): TerminalText {
  return joinTerminalText(STATUS_LINE_SEPARATOR, projection.nodes.map((node) => formatMarkdownNode(node)));
}

function formatMarkdownNode(node: SpecTreeProjectedNode, depth = 0): TerminalText {
  const current = terminal`${authoredText(NODE_INDENT.repeat(depth))}${authoredText(MARKDOWN_NODE_PREFIX)}${
    formatNodeLabel(node)
  }`;
  const children = node.children.map((child) => formatMarkdownNode(child, depth + 1));
  return joinTerminalText(STATUS_LINE_SEPARATOR, [current, ...children]);
}

function formatTable(projection: SpecTreeProjection): TerminalText {
  const rows = flattenProjectionNodes(projection.nodes).map((node) => [
    authoredText(KIND_REGISTRY[node.kind].label),
    externalValue(node.id),
    authoredText(node.state),
  ]);
  return joinTerminalText(STATUS_LINE_SEPARATOR, [
    SPEC_STATUS_TABLE_HEADER,
    formatTableRow([
      authoredText(TABLE_HEADER_SEPARATOR),
      authoredText(TABLE_HEADER_SEPARATOR),
      authoredText(TABLE_HEADER_SEPARATOR),
    ]),
    ...rows.map((row) => formatTableRow(row)),
  ]);
}

function flattenProjectionNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectionNodes(node.children)]);
}

function formatTableRow(values: readonly TerminalText[]): TerminalText {
  const separator = ` ${TABLE_SEPARATOR} `;
  return terminal`${authoredText(TABLE_SEPARATOR)} ${joinTerminalText(separator, values)} ${
    authoredText(TABLE_SEPARATOR)
  }`;
}

/**
 * Labels one projected node. The kind label and the state are product-owned registry values, while
 * the node id is a spec-tree path read off the filesystem, so only the id is escaped.
 */
function formatNodeLabel(node: SpecTreeProjectedNode): TerminalText {
  return joinTerminalText(STATUS_SEPARATOR, [
    authoredText(KIND_REGISTRY[node.kind].label),
    externalValue(node.id),
    terminal`[${authoredText(node.state)}]`,
  ]);
}
