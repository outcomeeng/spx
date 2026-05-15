import { execSync } from "node:child_process";
import { resolve } from "node:path";

const GIT_TOPLEVEL_CMD = "git rev-parse --show-toplevel";
const GIT_NOT_REPO_MARKER = "not a git repository";

export type ResolvedProductDir = {
  readonly productDir: string;
  readonly warning?: string;
};

export function resolveProductDir(cwd: string = process.cwd()): ResolvedProductDir {
  const resolvedCwd = resolve(cwd);
  try {
    const stdout = execSync(GIT_TOPLEVEL_CMD, {
      cwd: resolvedCwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    const toplevel = stdout.trim();
    if (toplevel.length > 0) {
      return { productDir: resolve(toplevel) };
    }
  } catch {
    // fall through to cwd fallback
  }

  return {
    productDir: resolvedCwd,
    warning:
      `warning: ${resolvedCwd} is not inside a git worktree — falling back to the current working directory. ${GIT_NOT_REPO_MARKER}.`,
  };
}
