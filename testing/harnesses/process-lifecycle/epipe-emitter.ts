/**
 * EPIPE emitter harness. Launches the `testing/fixtures/cli/epipe-emitter.ts`
 * source fixture — which installs the production lifecycle handlers and writes
 * stdout without end — through the development `tsx` loader, lets the OS pipe
 * buffer fill, then closes the parent's read end of stdout so the fixture's next
 * write raises EPIPE. It owns the fixture-root resolution, the launcher, and the
 * buffer-fill delay, and returns the spawn fixture's observations.
 *
 * @module testing/harnesses/process-lifecycle/epipe-emitter
 */

import { resolve } from "node:path";

import { runSpawnFixture, type SpawnFixtureResult } from "@testing/harnesses/process-lifecycle/spawn-fixture";

const PRODUCT_ROOT = resolve(__dirname, "..", "..", "..");
const EPIPE_EMITTER_FIXTURE_PATH = resolve(PRODUCT_ROOT, "testing", "fixtures", "cli", "epipe-emitter.ts");
const SOURCE_LAUNCHER = { command: "npx", args: ["tsx"] } as const;
const STDOUT_BUFFER_FILL_MS = 200;

/** Runs the EPIPE emitter until its stdout read end is closed and the process exits. */
export function runEpipeEmitter(): Promise<SpawnFixtureResult> {
  return runSpawnFixture({
    command: SOURCE_LAUNCHER.command,
    args: [...SOURCE_LAUNCHER.args, EPIPE_EMITTER_FIXTURE_PATH],
    cwd: PRODUCT_ROOT,
    destroyStdoutAfterMs: STDOUT_BUFFER_FILL_MS,
  });
}
