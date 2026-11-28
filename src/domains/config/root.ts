import { resolve } from "node:path";

import { authoredText, externalValue, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";

const GIT_NOT_REPO_MARKER = "not a git repository";

export type ResolvedProductDir = {
  readonly productDir: string;
  readonly warning?: TerminalText;
};

/** What the CLI invocation learns about a directory's local product root before it builds the product context. */
export type LocalProductRootReading = {
  readonly productDir: string;
  readonly isGitRepo: boolean;
};

/**
 * Reads the local product root of a directory. The CLI invocation supplies it from the state module,
 * which alone resolves product roots; config never derives one itself.
 */
export type LocalProductRootReader = (cwd: string) => LocalProductRootReading;

export function resolveProductDir(cwd: string, readLocalProductRoot: LocalProductRootReader): ResolvedProductDir {
  const resolvedCwd = resolve(cwd);
  const reading = readLocalProductRoot(resolvedCwd);
  if (reading.isGitRepo) {
    return { productDir: resolve(reading.productDir) };
  }

  return {
    productDir: resolvedCwd,
    warning: terminal`warning: ${
      externalValue(resolvedCwd)
    } is not inside a git worktree — falling back to the current working directory. ${
      authoredText(GIT_NOT_REPO_MARKER)
    }.`,
  };
}
