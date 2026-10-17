/**
 * Read recorder constants: the module-metadata key under which the worker-side recorder leaves
 * the absolute paths of the files a test module opened, and the absolute path of the Vitest
 * setup file that installs the recorder in a worker. This module holds no worker-side behavior,
 * so the journal reporter and its harness name the recorder without loading it.
 */
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

/** The module-metadata key holding the sorted absolute paths a test module opened. */
export const READ_RECORDER_META_KEY = "openedFilePaths";

/** The extensionless name of the sibling module Vitest registers through `setupFiles` to install the recorder in a worker. */
const READ_RECORDER_SETUP_BASENAME = "read-recorder-setup";

const THIS_MODULE_PATH = fileURLToPath(import.meta.url);

/**
 * The absolute path of the setup file that installs the recorder in a Vitest worker: the sibling
 * source module when this module runs from source, and the sibling built entry when it runs from
 * the built output, so both name a file that exists beside the running module.
 */
export const READ_RECORDER_SETUP_FILE = fileURLToPath(
  new URL(`./${READ_RECORDER_SETUP_BASENAME}${extname(THIS_MODULE_PATH)}`, import.meta.url),
);
