import { detectGitRoot } from "@/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

export const SPEC_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `warning: current directory is not inside a git worktree; reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} relative to the current working directory.`,
} as const;

export type SpecProductDirWarningHandler = (warning: string) => void;

export async function resolveSpecProductDir(
  cwd: string,
  onWarning?: SpecProductDirWarningHandler,
): Promise<string> {
  const result = await detectGitRoot(cwd);
  if (!result.isGitRepo) {
    onWarning?.(SPEC_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  }
  return result.root;
}
