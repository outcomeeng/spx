/**
 * Vitest setup file that records the files a test module opens.
 *
 * Registered through the `setupFiles` option of a programmatic run, it wraps the read entry
 * points of the worker's `node:fs` module, collects the absolute path of each file opened, and
 * at the end of the module's file suite leaves the sorted unique paths in the module's metadata
 * under the recorder's metadata key. Every wrapper delegates to the original function with its
 * original arguments, so the recorder alters no value a test reads and writes nothing itself.
 */
import { pathToFileURL } from "node:url";

import { READ_RECORDER_META_KEY, READ_RECORDER_VITEST_ENTRY_ENV } from "./read-recorder";
import { installReadRecorder } from "./read-recorder-install";

// The setup file lives in the harness's package, so a bare `vitest` import would resolve against
// the harness rather than the product under test. It imports the Vitest module the run named
// through the environment, the one the worker's test files import, so `afterAll` and
// `TestRunner` bind to the runner that executes the module.
const vitestEntry = process.env[READ_RECORDER_VITEST_ENTRY_ENV];
if (vitestEntry === undefined) {
  throw new Error(`${READ_RECORDER_VITEST_ENTRY_ENV} names no Vitest module for the read recorder`);
}
const { afterAll, TestRunner } = await import(pathToFileURL(vitestEntry).href) as typeof import("vitest");

const recorder = installReadRecorder();

const moduleSuite = TestRunner.getCurrentSuite();

afterAll(() => {
  recorder.restore();
  const recordedPaths = recorder.recordedPaths();
  if (recordedPaths === undefined) return;
  Object.assign(moduleSuite.file.meta, { [READ_RECORDER_META_KEY]: recordedPaths });
});
