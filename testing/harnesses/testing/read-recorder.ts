import fs from "node:fs";
import * as fsNamespace from "node:fs";
import * as fsPromisesNamespace from "node:fs/promises";
import { copyFile, mkdir, readdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { Reporter, TestModule } from "vitest/node";

import { compareCodeUnits } from "@/outcomeeng/spec-tree/graph/source/order";
import { findProductVitestEntry, productVitestNodeApiLoader, VITEST_RUN_MODE } from "@/test/languages/journal-reporter";
import {
  READ_RECORDER_META_KEY,
  READ_RECORDER_SETUP_FILE,
  READ_RECORDER_VITEST_ENTRY_ENV,
} from "@/test/languages/read-recorder";
import {
  installReadRecorder,
  READ_ENTRY_POINTS,
  READ_SURFACE,
  type ReadRecorder,
} from "@/test/languages/read-recorder-install";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  type GeneratedReadCase,
  type GeneratedReadPlan,
  locationDirectory,
  READ_STEP,
  type ReadEncoding,
  readStepName,
} from "@testing/generators/testing/read-recorder";
import { linkProductRunnerToolchain } from "@testing/harnesses/testing/journal-reporter";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");
/** The import form through which a fixture suite reads its data file, each served by its own fixture suite. */
export const READ_IMPORT_FORM = {
  NAMED: "named",
  DEFAULT: "default",
  NONE: "none",
} as const;
export type ReadImportForm = (typeof READ_IMPORT_FORM)[keyof typeof READ_IMPORT_FORM];
const READS_FIXTURE: Record<ReadImportForm, string> = {
  [READ_IMPORT_FORM.NAMED]: "reads-data.test.ts.fixture",
  [READ_IMPORT_FORM.DEFAULT]: "reads-data-default-import.test.ts.fixture",
  [READ_IMPORT_FORM.NONE]: "reads-nothing.test.ts.fixture",
};
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
  /** Every key present in the module's metadata at module end. */
  readonly moduleMetaKeys: readonly string[];
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
  return collected.sort((left, right) => compareCodeUnits(left[0], right[0]));
}

/** The directory holding the built output, which names the setup file an installed spx runs. */
const BUILT_OUTPUT_DIR = join(FIXTURE_DIR, "..", "..", "..", "dist");
const DETACHED_INSTALL_PREFIX = "spx-read-recorder-install-";
const BUILT_SCRIPT_EXTENSION = ".js";

/** Where the setup file registered in a run lives: beside the running source, or in a built copy no package hierarchy surrounds. */
export const SETUP_PLACEMENT = {
  SOURCE: "source",
  DETACHED_BUILD: "detached-build",
} as const;
export type SetupPlacement = (typeof SETUP_PLACEMENT)[keyof typeof SETUP_PLACEMENT];

/** Copies the built output into a temporary directory outside every package hierarchy and runs `run` with the copied setup file's path. */
async function withDetachedBuiltSetup<T>(run: (setupFile: string) => Promise<T>): Promise<T> {
  return withTempDir(DETACHED_INSTALL_PREFIX, async (installDir) => {
    for (const name of await readdir(BUILT_OUTPUT_DIR)) {
      if (!name.endsWith(BUILT_SCRIPT_EXTENSION)) continue;
      await copyFile(join(BUILT_OUTPUT_DIR, name), join(installDir, name));
    }
    return run(
      join(installDir, basename(READ_RECORDER_SETUP_FILE, extname(READ_RECORDER_SETUP_FILE)) + BUILT_SCRIPT_EXTENSION),
    );
  });
}

function runReadModule(
  withRecorder: boolean,
  content: string,
  importForm: ReadImportForm,
  placement: SetupPlacement = SETUP_PLACEMENT.SOURCE,
): Promise<RecordedReadRunObservation> {
  if (placement === SETUP_PLACEMENT.DETACHED_BUILD) {
    return withDetachedBuiltSetup((setupFile) => runReadModuleWithSetup(withRecorder, content, importForm, setupFile));
  }
  return runReadModuleWithSetup(withRecorder, content, importForm, READ_RECORDER_SETUP_FILE);
}

function runReadModuleWithSetup(
  withRecorder: boolean,
  content: string,
  importForm: ReadImportForm,
  setupFile: string,
): Promise<RecordedReadRunObservation> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    await linkProductRunnerToolchain(productDir);
    await copyFile(join(FIXTURE_DIR, READS_FIXTURE[importForm]), join(productDir, SUITE_NAME));
    await writeFile(join(productDir, DATA_FILE_NAME), content);
    const runTempDir = join(productDir, RUN_TEMP_DIR);
    await mkdir(runTempDir);
    const dataFilePath = await realpath(join(productDir, DATA_FILE_NAME));

    const consoleOutput: string[] = [];
    let recordedPaths: unknown;
    let moduleMetaKeys: readonly string[] = [];
    let moduleState = "";
    let readContent: unknown;
    const reporter: Reporter = {
      onUserConsoleLog(log) {
        consoleOutput.push(log.content);
      },
      onTestModuleEnd(testModule: TestModule) {
        recordedPaths = (testModule.meta() as Record<string, unknown>)[READ_RECORDER_META_KEY];
        moduleMetaKeys = Object.keys(testModule.meta());
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
    const vitestEntry = findProductVitestEntry(productDir);
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
        setupFiles: withRecorder ? [setupFile] : [],
        env: vitestEntry === undefined ? {} : { [READ_RECORDER_VITEST_ENTRY_ENV]: vitestEntry },
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
    return {
      dataFilePath,
      dataFileContent: content,
      recordedPaths,
      moduleMetaKeys,
      moduleState,
      readContent,
      files,
      consoleOutput,
    };
  });
}

/**
 * Runs real Vitest over a module that reads one generated data file through the given import form, with the recorder's setup
 * file registered in the worker, and returns what the module's metadata, the product directory,
 * and the console held when the run finished.
 */
export function observeRecordedReadRun(
  importForm: ReadImportForm,
  placement: SetupPlacement = SETUP_PLACEMENT.SOURCE,
): Promise<RecordedReadRunObservation> {
  return runReadModule(true, sampleGeneratedValue(arbitraryDomainLiteral()), importForm, placement);
}

/**
 * Runs the same data-reading module twice over the same generated content, once with the
 * recorder registered and once without, so a caller compares what the recorder changed.
 * The run's `TMPDIR` is a directory inside the product directory, so writes under the
 * temp directory and nested directories appear in the file snapshot.
 */
export async function observeRecorderEffects(): Promise<RecorderEffectObservation> {
  const content = sampleGeneratedValue(arbitraryDomainLiteral());
  const baseline = await runReadModule(false, content, READ_IMPORT_FORM.NAMED);
  const recorded = await runReadModule(true, content, READ_IMPORT_FORM.NAMED);
  return { recorded, baseline };
}

const READ_RECORDER_PLAN_PREFIX = "spx-read-recorder-plan-";

/** The `node:fs` read entry points, each performing one read of a path and yielding what it read. */
type EntryPointName = (typeof READ_ENTRY_POINTS)[number]["name"];
type Reader = (target: string, encoding: BufferEncoding | undefined) => Promise<string | Buffer>;

const FS_READERS: Record<EntryPointName, Reader> = {
  readFileSync: async (target, encoding) => fs.readFileSync(target, { encoding: encoding ?? null }),
  readFile: (target, encoding) =>
    new Promise((resolveRead, rejectRead) => {
      fs.readFile(
        target,
        { encoding: encoding ?? null },
        (error, data) => error ? rejectRead(error) : resolveRead(data),
      );
    }),
  openSync: async (target, encoding) => {
    const descriptor = fs.openSync(target, fs.constants.O_RDONLY);
    try {
      return fs.readFileSync(descriptor, { encoding: encoding ?? null });
    } finally {
      fs.closeSync(descriptor);
    }
  },
  open: async (target, encoding) => {
    const descriptor = await new Promise<number>((resolveOpen, rejectOpen) => {
      fs.open(target, fs.constants.O_RDONLY, (error, opened) => error ? rejectOpen(error) : resolveOpen(opened));
    });
    try {
      return fs.readFileSync(descriptor, { encoding: encoding ?? null });
    } finally {
      fs.closeSync(descriptor);
    }
  },
  createReadStream: (target, encoding) =>
    new Promise((resolveRead, rejectRead) => {
      const chunks: Array<string | Buffer> = [];
      const stream = fs.createReadStream(target, { encoding });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", rejectRead);
      stream.on("end", () =>
        resolveRead(typeof chunks[0] === "string" ? chunks.join("") : Buffer.concat(chunks as Buffer[])));
    }),
};

const PROMISES_READERS: Record<EntryPointName, Reader> = {
  ...FS_READERS,
  readFile: (target, encoding) => fs.promises.readFile(target, { encoding: encoding ?? null }),
  open: async (target, encoding) => {
    const handle = await fs.promises.open(target);
    try {
      return await handle.readFile({ encoding: encoding ?? null });
    } finally {
      await handle.close();
    }
  },
};

type ReadEntryPoint = (typeof READ_ENTRY_POINTS)[number];

function readThrough(
  entryPoint: ReadEntryPoint,
  target: string,
  encoding: BufferEncoding | undefined,
): Promise<string | Buffer> {
  const readers = entryPoint.surface === READ_SURFACE.PROMISES ? PROMISES_READERS : FS_READERS;
  return readers[entryPoint.name](target, encoding);
}

/** How a read ended: the content it yielded and whether it was decoded, or the error it failed with. */
export const READ_OUTCOME_KIND = {
  READ: "read",
  FAILED: "failed",
} as const;
export type ReadOutcome =
  | { readonly kind: typeof READ_OUTCOME_KIND.READ; readonly decoded: boolean; readonly content: string }
  | { readonly kind: typeof READ_OUTCOME_KIND.FAILED; readonly code: unknown; readonly message: string };

async function outcomeOf(
  entryPoint: ReadEntryPoint,
  target: string,
  encoding: BufferEncoding | undefined,
): Promise<ReadOutcome> {
  try {
    const content = await readThrough(entryPoint, target, encoding);
    return { kind: READ_OUTCOME_KIND.READ, decoded: typeof content === "string", content: content.toString("utf8") };
  } catch (error) {
    const failure = error as { code?: unknown; message: string };
    return { kind: READ_OUTCOME_KIND.FAILED, code: failure.code, message: failure.message };
  }
}

/** What the recorder collected over a generated plan, the real root of the plan's world, and how each read ended with and without the recorder. */
export interface ReadPlanObservation {
  /** The real path of the directory holding the plan's world. */
  readonly root: string;
  /** The sorted unique absolute paths the recorder collected, or `undefined` when it collected none. */
  readonly recordedPaths: readonly string[] | undefined;
  /** How each of the plan's reads ended, in step order, before the recorder was installed. */
  readonly originalOutcomes: readonly ReadOutcome[];
  /** How each of the plan's reads ended, in step order, with the recorder installed. */
  readonly wrappedOutcomes: readonly ReadOutcome[];
}

async function performPlan(
  root: string,
  plan: GeneratedReadPlan,
): Promise<ReadOutcome[]> {
  process.chdir(root);
  const outcomes: ReadOutcome[] = [];
  for (const step of plan.steps) {
    if (step.kind === READ_STEP.CHDIR) {
      process.chdir(join(root, locationDirectory(plan, step.location)));
    } else {
      outcomes.push(await outcomeOf(step.entryPoint, readStepName(plan, step), undefined));
    }
  }
  return outcomes;
}

/**
 * Creates the plan's world in a real temporary directory — every file at every location, a
 * symbolic link to each file, and no entry under the unresolved name — performs the plan's
 * working-directory changes and reads through the real `node:fs` entry points once without the
 * recorder and once with it installed, restores the recorder and the working directory, and
 * returns what the recorder collected and how every read ended in both passes.
 */
export function observeReadPlan(plan: GeneratedReadPlan): Promise<ReadPlanObservation> {
  return withTempDir(READ_RECORDER_PLAN_PREFIX, async (tempDir) => {
    const root = await realpath(tempDir);
    const locations = ["", ...plan.directories];
    for (const location of locations) {
      await mkdir(join(root, location), { recursive: true });
      for (const [index, fileName] of plan.files.entries()) {
        await writeFile(join(root, location, fileName), fileName);
        await symlink(join(root, location, fileName), join(root, location, plan.links[index]));
      }
    }
    const priorWorkingDirectory = process.cwd();
    let recorder: ReadRecorder | undefined;
    try {
      const originalOutcomes = await performPlan(root, plan);
      recorder = installReadRecorder();
      const wrappedOutcomes = await performPlan(root, plan);
      return { root, recordedPaths: recorder.recordedPaths(), originalOutcomes, wrappedOutcomes };
    } finally {
      recorder?.restore();
      process.chdir(priorWorkingDirectory);
    }
  });
}

/** Whether the file a delegation read targets exists. */
export const READ_TARGET = {
  PRESENT: "present",
  MISSING: "missing",
} as const;
export type ReadTarget = (typeof READ_TARGET)[keyof typeof READ_TARGET];

/** The same read made before the recorder is installed and while it is installed. */
export interface DelegationObservation {
  readonly original: ReadOutcome;
  readonly wrapped: ReadOutcome;
}

/**
 * Reads one generated file (present, or missing from the filesystem) through one entry point
 * with the given encoding option and the real `node:fs` function before the recorder is installed, then again with the
 * recorder installed, and returns both outcomes.
 */
export function observeEntryPointDelegation(
  entryPoint: ReadEntryPoint,
  readCase: GeneratedReadCase,
  encoding: ReadEncoding,
  targetState: ReadTarget,
): Promise<DelegationObservation> {
  return withTempDir(READ_RECORDER_PLAN_PREFIX, async (tempDir) => {
    const target = join(await realpath(tempDir), readCase.fileName);
    if (targetState === READ_TARGET.PRESENT) await writeFile(target, readCase.content);
    const original = await outcomeOf(entryPoint, target, encoding);
    const recorder = installReadRecorder();
    try {
      return { original, wrapped: await outcomeOf(entryPoint, target, encoding) };
    } finally {
      recorder.restore();
    }
  });
}

/**
 * The values of the `node:fs` module's functions and named bindings at one moment, keyed by the
 * surface they belong to and their name: the default export's properties, `fs.promises`'s
 * properties, and the named bindings of the `node:fs` and `node:fs/promises` module namespaces.
 */
export type FsSnapshot = ReadonlyMap<string, unknown>;

const SNAPSHOT_KEY_SEPARATOR = ".";

function snapshotFs(): FsSnapshot {
  const surfaces: ReadonlyArray<readonly [string, object]> = [
    ["default", fs],
    ["promises", fs.promises],
    ["namespace", fsNamespace],
    ["promisesNamespace", fsPromisesNamespace],
  ];
  return new Map(
    surfaces.flatMap(([surface, table]) =>
      Object.entries(table).map(([name, value]) => [`${surface}${SNAPSHOT_KEY_SEPARATOR}${name}`, value] as const)
    ),
  );
}

/** The `node:fs` module before the recorder is installed, while installed, and after it is restored. */
export interface RestorationObservation {
  readonly before: FsSnapshot;
  readonly installed: FsSnapshot;
  readonly after: FsSnapshot;
}

/** Installs and restores the recorder over the real `node:fs` module, snapshotting the module at each step. */
export function observeFsRestoration(): RestorationObservation {
  const before = snapshotFs();
  const recorder = installReadRecorder();
  let installed: FsSnapshot;
  try {
    installed = snapshotFs();
  } finally {
    recorder.restore();
  }
  return { before, installed, after: snapshotFs() };
}

/** How a read of an invalid target ended before the recorder was installed and while it is installed, and what the recorder collected. */
export interface InvalidTargetObservation {
  readonly original: ReadOutcome;
  readonly wrapped: ReadOutcome;
  /** The sorted unique absolute paths the recorder collected, or `undefined` when it collected none. */
  readonly recordedPaths: readonly string[] | undefined;
}

/**
 * Reads a value that is not a valid read target through one entry point with the real `node:fs`
 * function before the recorder is installed, then again with the recorder installed, and returns
 * both outcomes and what the recorder collected.
 */
export async function observeInvalidTargetRead(
  entryPoint: ReadEntryPoint,
  target: unknown,
): Promise<InvalidTargetObservation> {
  // The target is deliberately not a path: the entry points under observation receive it as the caller passed it.
  const invalidTarget = target as never;
  const original = await outcomeOf(entryPoint, invalidTarget, undefined);
  const recorder = installReadRecorder();
  try {
    const wrapped = await outcomeOf(entryPoint, invalidTarget, undefined);
    return { original, wrapped, recordedPaths: recorder.recordedPaths() };
  } finally {
    recorder.restore();
  }
}
