import { copyFile, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
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
/** The test-meta key under which the fixture suite reports the content it read. */
const READ_CONTENT_META_KEY = "readContent";
/** The directory inside the product directory that serves as the run's temp directory. */
const RUN_TEMP_DIR = "run-tmp";
/** The environment variable through which the fixture suite learns the path of the data file it must open. */
const DATA_FILE_ENV = "READ_RECORDER_DATA_FILE";
const TEMP_PRODUCT_PREFIX = "spx-read-recorder-";
const NODE_MODULES = "node_modules";

/** What a real programmatic Vitest run over a data-reading module left. */
export interface RecordedReadRunObservation {
  /** The absolute path of the data file the module opened, as the filesystem resolves it. */
  readonly dataFilePath: string;
  /** The content the harness wrote to the data file. */
  readonly dataFileContent: string;
  /** The module's metadata at module end, keyed by the recorder's metadata key. */
  readonly recordedPaths: unknown;
  /** The module's state when the run finished. */
  readonly moduleState: string;
  /** The content the module's test read from the data file, as the test reported it. */
  readonly readContent: unknown;
  /** Every file under the product directory, including the run's temp directory, as relative path and content. */
  readonly files: ReadonlyArray<readonly [string, string]>;
  /** Console output the module's worker emitted during the run. */
  readonly consoleOutput: readonly string[];
}

/** The same module run with and without the recorder registered in its worker. */
export interface RecorderEffectObservation {
  readonly recorded: RecordedReadRunObservation;
  readonly baseline: RecordedReadRunObservation;
}

async function snapshotFiles(root: string, dir: string = root): Promise<Array<readonly [string, string]>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const collected: Array<readonly [string, string]> = [];
  for (const entry of entries) {
    if (entry.name === NODE_MODULES) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push([`${relative(root, absolute)}/`, ""], ...await snapshotFiles(root, absolute));
    } else {
      collected.push([relative(root, absolute), await readFile(absolute, "utf8")]);
    }
  }
  return collected.sort((left, right) => left[0].localeCompare(right[0]));
}

function runReadModule(withRecorder: boolean, content: string): Promise<RecordedReadRunObservation> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    await linkProductRunnerToolchain(productDir);
    await copyFile(join(FIXTURE_DIR, READS_FIXTURE), join(productDir, SUITE_NAME));
    await writeFile(join(productDir, DATA_FILE_NAME), content);
    const runTempDir = join(productDir, RUN_TEMP_DIR);
    await mkdir(runTempDir);
    const dataFilePath = await realpath(join(productDir, DATA_FILE_NAME));

    const consoleOutput: string[] = [];
    let recordedPaths: unknown;
    let moduleState = "";
    let readContent: unknown;
    const reporter: Reporter = {
      onUserConsoleLog(log) {
        consoleOutput.push(log.content);
      },
      onTestModuleEnd(testModule: TestModule) {
        recordedPaths = (testModule.meta() as Record<string, unknown>)[READ_RECORDER_META_KEY];
        moduleState = testModule.state();
        for (const testCase of testModule.children.allTests()) {
          readContent = (testCase.meta() as Record<string, unknown>)[READ_CONTENT_META_KEY];
        }
      },
    };
    const loader = productVitestNodeApiLoader;
    const resolution = loader.resolve(productDir);
    if (!resolution.resolved) throw new Error(`No Vitest Node API resolves at ${productDir}`);
    const { startVitest } = await loader.load(resolution.specifier);
    const priorExitCode = process.exitCode;
    const priorDataFile = process.env[DATA_FILE_ENV];
    const priorTmpdir = process.env.TMPDIR;
    process.env[DATA_FILE_ENV] = dataFilePath;
    process.env.TMPDIR = runTempDir;
    try {
      const vitest = await startVitest(VITEST_RUN_MODE, [SUITE_NAME], {
        root: productDir,
        watch: false,
        reporters: [reporter],
        setupFiles: withRecorder ? [READ_RECORDER_SETUP_FILE] : [],
      });
      await vitest.close();
    } finally {
      process.exitCode = priorExitCode;
      if (priorDataFile === undefined) delete process.env[DATA_FILE_ENV];
      else process.env[DATA_FILE_ENV] = priorDataFile;
      if (priorTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = priorTmpdir;
    }
    const files = await snapshotFiles(productDir);
    return { dataFilePath, dataFileContent: content, recordedPaths, moduleState, readContent, files, consoleOutput };
  });
}

/**
 * Runs real Vitest over a module that reads one generated data file, with the recorder's setup
 * file registered in the worker, and returns what the module's metadata, the product directory,
 * and the console held when the run finished.
 */
export function observeRecordedReadRun(): Promise<RecordedReadRunObservation> {
  return runReadModule(true, sampleGeneratedValue(arbitraryDomainLiteral()));
}

/**
 * Runs the same data-reading module twice over the same generated content, once with the
 * recorder registered and once without, so a caller compares what the recorder changed.
 * The run's `TMPDIR` is a directory inside the product directory, so writes under the
 * temp directory and nested directories appear in the file snapshot.
 */
export async function observeRecorderEffects(): Promise<RecorderEffectObservation> {
  const content = sampleGeneratedValue(arbitraryDomainLiteral());
  const baseline = await runReadModule(false, content);
  const recorded = await runReadModule(true, content);
  return { recorded, baseline };
}
