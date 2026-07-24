import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import type { GitDependencies } from "@/lib/git/root";
import {
  createFilesystemSpecTreeSource,
  findNextSpecTreeNode,
  readSpecTree,
  type SpecTreeNode,
  type SpecTreeSnapshot,
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

export const SPEC_NEXT_MESSAGE = {
  EMPTY: `No spec-tree nodes found in ${SPEC_TREE_CONFIG.ROOT_DIRECTORY}`,
  COMPLETE: "All spec-tree nodes are passing",
  HEADING: "Next spec-tree node:",
  KIND_LABEL: "Kind",
  PATH_LABEL: "Path",
  STATE_LABEL: "State",
} as const;

const INDENT = "  ";
/** The product's own line structure between the next-node lines. */
const NEXT_LINE_SEPARATOR = "\n";

export interface NextOptions {
  cwd?: string;
  gitDependencies?: GitDependencies;
  onWarning?: SpecProductDirWarningHandler;
  source?: SpecTreeSource;
}

export async function nextCommand(options: NextOptions = {}): Promise<TerminalText> {
  if (options.source !== undefined) {
    // Injected sources bypass filesystem and git resolution.
    const snapshot = await readSpecTree({ source: options.source });
    return formatNextSpecTreeNode(snapshot);
  }

  const productDir = await resolveSpecProductDir(
    options.cwd ?? CONFIG_PROCESS_CWD.read(),
    options.gitDependencies,
    options.onWarning,
  );
  const source = createFilesystemSpecTreeSource({ productDir });
  const snapshot = await readSpecTree({ source });

  return formatNextSpecTreeNode(snapshot);
}

function formatNextSpecTreeNode(snapshot: SpecTreeSnapshot): TerminalText {
  if (snapshot.allNodes.length === 0) {
    return authoredText(SPEC_NEXT_MESSAGE.EMPTY);
  }

  const next = findNextSpecTreeNode(snapshot);

  if (next === null) {
    return authoredText(SPEC_NEXT_MESSAGE.COMPLETE);
  }

  return formatNextNode(next);
}

/**
 * States the next node. Labels, the kind label, and the state are product-owned, while the node id
 * is a spec-tree path read off the filesystem, so only the id carries the escaping decision.
 */
function formatNextNode(node: SpecTreeNode): TerminalText {
  return joinTerminalText(NEXT_LINE_SEPARATOR, [
    authoredText(SPEC_NEXT_MESSAGE.HEADING),
    authoredText(""),
    terminal`${authoredText(INDENT)}${authoredText(SPEC_NEXT_MESSAGE.PATH_LABEL)}: ${externalValue(node.id)}`,
    terminal`${authoredText(INDENT)}${authoredText(SPEC_NEXT_MESSAGE.KIND_LABEL)}: ${
      authoredText(KIND_REGISTRY[node.kind].label)
    }`,
    terminal`${authoredText(INDENT)}${authoredText(SPEC_NEXT_MESSAGE.STATE_LABEL)}: ${authoredText(node.state)}`,
  ]);
}
