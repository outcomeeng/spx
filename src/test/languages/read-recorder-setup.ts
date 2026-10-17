/**
 * Vitest setup file that records the files a test module opens.
 *
 * Registered through the `setupFiles` option of a programmatic run, it wraps the read entry
 * points of the worker's `node:fs` module, collects the absolute path of each file opened, and
 * at the end of the module's file suite leaves the sorted unique paths in the module's metadata
 * under the recorder's metadata key. Every wrapper delegates to the original function with its
 * original arguments, so the recorder alters no value a test reads and writes nothing itself.
 */
import { afterAll, TestRunner } from "vitest";

import { READ_RECORDER_META_KEY } from "./read-recorder";
import { installReadRecorder } from "./read-recorder-install";

const recorder = installReadRecorder();

const moduleSuite = TestRunner.getCurrentSuite();

afterAll(() => {
  recorder.restore();
  const recordedPaths = recorder.recordedPaths();
  if (recordedPaths === undefined) return;
  Object.assign(moduleSuite.file.meta, { [READ_RECORDER_META_KEY]: recordedPaths });
});
