import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { PRODUCT_DIR_NOT_GIT_WARNING } from "./product-directory-contract";

const GIT_EXECUTABLE = "git";
const GIT_TOPLEVEL_ARGS = ["rev-parse", "--show-toplevel"] as const;
function formatProductDirNotGitWarning(productDir: string): string {
  return `${PRODUCT_DIR_NOT_GIT_WARNING.prefix}${productDir}${PRODUCT_DIR_NOT_GIT_WARNING.suffix}`;
}

export type ResolvedProductDir = {
  readonly productDir: string;
  readonly warning?: string;
};

export type ProductDirResolverDeps = {
  readonly readGitToplevel: (cwd: string) => string | undefined;
};

export function resolveProductDir(
  cwd: string,
  deps: ProductDirResolverDeps = DEFAULT_PRODUCT_DIR_RESOLVER_DEPS,
): ResolvedProductDir {
  const resolvedCwd = resolve(cwd);
  const toplevel = deps.readGitToplevel(resolvedCwd);
  if (toplevel !== undefined && toplevel.length > 0) {
    return { productDir: resolve(toplevel) };
  }

  return {
    productDir: resolvedCwd,
    warning: formatProductDirNotGitWarning(resolvedCwd),
  };
}

const DEFAULT_PRODUCT_DIR_RESOLVER_DEPS: ProductDirResolverDeps = {
  readGitToplevel: (cwd) => {
    try {
      return execFileSync(GIT_EXECUTABLE, [...GIT_TOPLEVEL_ARGS], { // NOSONAR - spx intentionally uses the caller's git executable.
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      }).trim();
    } catch {
      return undefined;
    }
  },
};
