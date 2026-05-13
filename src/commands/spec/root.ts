import { detectGitRoot, type GitDependencies } from "@/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export const SPEC_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `Warning: Not in a git repository. Reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} relative to the current working directory.`,
} as const;

export type SpecProductDirWarningHandler = (warning: string) => void;

export async function resolveSpecProductDir(
  cwd: string,
  gitDependencies?: GitDependencies,
  onWarning?: SpecProductDirWarningHandler,
): Promise<string> {
  const result = await detectGitRoot(cwd, gitDependencies);
  if (!result.isGitRepo) {
    onWarning?.(SPEC_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  }
  return result.root;
}
