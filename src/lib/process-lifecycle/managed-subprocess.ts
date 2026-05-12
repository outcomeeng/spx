import type { ChildProcess, SpawnOptions } from "node:child_process";

import type { ProcessRunner } from "./types";

export const MANAGED_SUBPROCESS_STDIO = "pipe";

export type ManagedSubprocessSpawnOptions = Omit<SpawnOptions, "stdio"> & {
  readonly stdio?: never;
};

export function spawnManagedSubprocess(
  runner: ProcessRunner,
  command: string,
  args: readonly string[],
  options: ManagedSubprocessSpawnOptions,
): ChildProcess {
  return runner.spawn(command, args, {
    ...options,
    stdio: MANAGED_SUBPROCESS_STDIO,
  });
}
