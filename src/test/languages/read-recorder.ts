/**
 * Read recorder constants: the module-metadata key under which the worker-side recorder leaves
 * the absolute paths of the files a test module opened, and the absolute path of the Vitest
 * setup file that installs the recorder in a worker. This module holds no worker-side behavior,
 * so the journal reporter and its harness name the recorder without loading it.
 */
import { fileURLToPath } from "node:url";

/** The module-metadata key holding the sorted absolute paths a test module opened. */
export const READ_RECORDER_META_KEY = "openedFilePaths";

/** The sibling module Vitest registers through `setupFiles` to install the recorder in a worker. */
const READ_RECORDER_SETUP_MODULE = "./read-recorder-setup.ts";

/** The absolute path of the setup file that installs the recorder in a Vitest worker. */
export const READ_RECORDER_SETUP_FILE = fileURLToPath(new URL(READ_RECORDER_SETUP_MODULE, import.meta.url));
