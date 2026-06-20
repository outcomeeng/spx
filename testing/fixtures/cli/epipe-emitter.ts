/**
 * EPIPE smoke-test fixture. Installs the lifecycle handlers, then writes
 * to stdout in an unbounded loop. The L2 scenario test spawns this fixture
 * via tsx, lets the OS pipe buffer fill, then destroys the parent's read
 * end of the pipe so the next write triggers the EPIPE handler.
 *
 * @module spx/13-cli.enabler/tests/fixtures/epipe-emitter
 */

import { installLifecycle } from "@/lib/process-lifecycle";

installLifecycle();

const writeIntervalMs = 1;
const chunkSize = 1024;
const chunk = "x".repeat(chunkSize) + "\n";

setInterval(() => {
  process.stdout.write(chunk);
}, writeIntervalMs);
