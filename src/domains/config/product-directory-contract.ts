export const PRODUCT_DIR_NOT_GIT_WARNING = {
  prefix: "warning: ",
  suffix: " is not inside a git worktree — falling back to the current working directory. not a git repository.",
} as const;

export const LEGACY_PRODUCT_DIRECTORY_FIELDS = ["projectRoot", "projectDir"] as const;
