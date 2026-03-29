/**
 * Shared test helpers for session core-operations tests.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a temporary sessions directory for testing.
 * Caller is responsible for cleanup via rm(dir, { recursive: true }).
 */
export async function createTempSessionsDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "spx-sessions-test-"));
}
