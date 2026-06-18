/**
 * Hook CLI test harnesses.
 *
 * @module testing/harnesses/hook-cli
 */

import { join } from "node:path";

import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

export interface HookCliWorktreeEnv {
  readonly envFile: string;
  readonly worktreePath: string;
  readonly worktreesDir: string;
}

/** Provides a bare-pool worktree, hook env file path, and shared worktrees scope for packaged hook CLI tests. */
export async function withHookCliWorktreeEnv(
  options: {
    readonly envFileName: string;
    readonly prefix: string;
    readonly worktreeName: string;
  },
  callback: (env: HookCliWorktreeEnv) => Promise<void>,
): Promise<void> {
  await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: options.worktreeName }] }, async (layout) => {
    await withTempDir(options.prefix, async (worktreesDir) => {
      await callback({
        envFile: join(worktreesDir, options.envFileName),
        worktreePath: layout.worktree(options.worktreeName),
        worktreesDir,
      });
    });
  });
}
