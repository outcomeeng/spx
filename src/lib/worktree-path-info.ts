/**
 * Real filesystem path-info adapter for worktree resolution.
 *
 * @module lib/worktree-path-info
 */

import { stat } from "node:fs/promises";

import type { WorktreePathInfo } from "@/domains/worktree/resolve";

export const defaultWorktreePathInfo: WorktreePathInfo = {
  isExistingNonDirectory: async (path) => {
    try {
      const pathStats = await stat(path);
      return !pathStats.isDirectory();
    } catch {
      return false;
    }
  },
};
