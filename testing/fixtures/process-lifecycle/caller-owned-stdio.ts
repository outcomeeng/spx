import type { ProcessRunner } from "@/lib/process-lifecycle";
import { spawnManagedSubprocess } from "@/lib/process-lifecycle";

declare const runner: ProcessRunner;

spawnManagedSubprocess(runner, "fixture-command", [], {
  cwd: process.cwd(),
  stdio: "inherit",
});
