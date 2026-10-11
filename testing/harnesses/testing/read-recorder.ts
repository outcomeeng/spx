import { copyFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Reporter, TestModule } from "vitest/node";

import { productVitestNodeApiLoader, VITEST_RUN_MODE } from "@/test/languages/journal-reporter";
import { READ_RECORDER_META_KEY, READ_RECORDER_SETUP_FILE } from "@/test/languages/read-recorder";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { linkProductRunnerToolchain } from "@testing/harnesses/testing/journal-reporter";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");
const READS_FIXTURE = "reads-data.test.ts.fixture";
const SUITE_NAME = "suite.test.ts";
/** The data file the fixture suite opens; the fixture suite names it the same way. */
const DATA_FILE_NAME = "data.txt";
/** The environment variable through which the fixture suite learns the content it must read back. */
const EXPECTED_CONTENT_ENV = "READ_RECORDER_EXPECTED_CONTENT";
/** The environment variable through which the fixture suite learns the path of the data file it must open. */
const DATA_FILE_ENV = "READ_RECORDER_DATA_FILE";
const TEMP_PRODUCT_PREFIX = "spx-read-recorder-";
const NODE_MODULES = "node_modules";

/** The module state Vitest reports for a module whose every test passed. */
export const MODULE_STATE_PASSED = "passed";

/** What a real programmatic Vitest run over a data-reading module left. */
export interface RecordedReadRunObservation {
  /** The absolute path of the data file the module opened, as the filesystem resolves it. */
  readonly dataFilePath: string;
  /** The module's metadata at module end, keyed by the recorder's metadata key. */
  readonly recordedPaths: unknown;
  /** The module's state when the run finished. */
  readonly moduleState: string;
  /** Names of product-directory entries before the run, excluding the toolchain link. */
  readonly entriesBefore: readonly string[];
  /** Names of product-directory entries after the run, excluding the toolchain link. */
  readonly entriesAfter: readonly string[];
  /** Console output the module's worker emitted during the run. */
  readonly consoleOutput: readonly string[];
}

async function productEntries(productDir: string): Promise<readonly string[]> {
  const entries = await readdir(productDir);
  return entries.filter((name) => name !== NODE_MODULES).sort((left, right) => left.localeCompare(right));
}

/**
 * Runs real Vitest over a module that reads one generated data file, with the recorder's setup
 * file registered in the worker, and returns what the module's metadata, the product directory,
 * and the console held when the run finished.
 */
export function observeRecordedReadRun(): Promise<RecordedReadRunObservation> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    await linkProductRunnerToolchain(productDir);
    await copyFile(join(FIXTURE_DIR, READS_FIXTURE), join(productDir, SUITE_NAME));
    const content = sampleGeneratedValue(arbitraryDomainLiteral());
    await writeFile(join(productDir, DATA_FILE_NAME), content);
    const dataFilePath = await realpath(join(productDir, DATA_FILE_NAME));
    const entriesBefore = await productEntries(productDir);

    const consoleOutput: string[] = [];
    let recordedPaths: unknown;
    let moduleState = "";
    const reporter: Reporter = {
      onUserConsoleLog(log) {
        consoleOutput.push(log.content);
      },
      onTestModuleEnd(testModule: TestModule) {
        recordedPaths = (testModule.meta() as Record<string, unknown>)[READ_RECORDER_META_KEY];
        moduleState = testModule.state();
      },
    };
    const loader = productVitestNodeApiLoader;
    const resolution = loader.resolve(productDir);
    if (!resolution.resolved) throw new Error(`No Vitest Node API resolves at ${productDir}`);
    const { startVitest } = await loader.load(resolution.specifier);
    const priorExitCode = process.exitCode;
    const priorExpected = process.env[EXPECTED_CONTENT_ENV];
    const priorDataFile = process.env[DATA_FILE_ENV];
    process.env[EXPECTED_CONTENT_ENV] = content;
    process.env[DATA_FILE_ENV] = dataFilePath;
    try {
      const vitest = await startVitest(VITEST_RUN_MODE, [SUITE_NAME], {
        root: productDir,
        watch: false,
        reporters: [reporter],
        setupFiles: [READ_RECORDER_SETUP_FILE],
      });
      await vitest.close();
    } finally {
      process.exitCode = priorExitCode;
      if (priorExpected === undefined) delete process.env[EXPECTED_CONTENT_ENV];
      else process.env[EXPECTED_CONTENT_ENV] = priorExpected;
      if (priorDataFile === undefined) delete process.env[DATA_FILE_ENV];
      else process.env[DATA_FILE_ENV] = priorDataFile;
    }
    const entriesAfter = await productEntries(productDir);
    return { dataFilePath, recordedPaths, moduleState, entriesBefore, entriesAfter, consoleOutput };
  });
}
