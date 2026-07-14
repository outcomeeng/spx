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

export interface NextOptions {
  cwd?: string;
  gitDependencies?: GitDependencies;
  onWarning?: SpecProductDirWarningHandler;
  source?: SpecTreeSource;
}

export async function nextCommand(options: NextOptions = {}): Promise<string> {
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

function formatNextSpecTreeNode(snapshot: SpecTreeSnapshot): string {
  if (snapshot.allNodes.length === 0) {
    return SPEC_NEXT_MESSAGE.EMPTY;
  }

  const next = findNextSpecTreeNode(snapshot);

  if (next === null) {
    return SPEC_NEXT_MESSAGE.COMPLETE;
  }

  return formatNextNode(next);
}

function formatNextNode(node: SpecTreeNode): string {
  return [
    SPEC_NEXT_MESSAGE.HEADING,
    "",
    `${INDENT}${SPEC_NEXT_MESSAGE.PATH_LABEL}: ${node.id}`,
    `${INDENT}${SPEC_NEXT_MESSAGE.KIND_LABEL}: ${KIND_REGISTRY[node.kind].label}`,
    `${INDENT}${SPEC_NEXT_MESSAGE.STATE_LABEL}: ${node.state}`,
  ].join("\n");
}
