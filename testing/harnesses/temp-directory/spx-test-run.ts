/**
 * Built-executable harness for the run-root evidence of `spx test`: it stages a product that holds one
 * inert Vitest suite, runs `node bin/spx.js test` against it as its own process, and returns what the
 * suite observed in its runner process together with the filesystem state observed after the command
 * exited.
 *
 * The product is a freshly initialized Git repository that stands in for one worktree. The command starts
 * from a Git-clean environment that carries no inherited run root, and its user temp folder is an empty
 * directory the harness owns, so any directory the invocation creates outside its run root appears there.
 * The harness owns lifecycle, environment, and cleanup; it returns observations and asserts nothing.
 *
 * @module testing/harnesses/temp-directory/spx-test-run
 */

import { execa } from "execa";
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TESTING_CLI } from "@/interfaces/cli/test";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { worktreeScopeDir } from "@/lib/state-store";
import { TEMP_DIRECTORY_ENV_VAR, TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { linkProductRunnerToolchain } from "@testing/harnesses/testing/journal-reporter";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { TEMP_DIRECTORY_CHILD_MODE, type TempDirectoryChildReport } from "./child-protocol";

/** The output modes of `spx test` the run-root evidence covers. */
export const SPX_TEST_RUN_MODE = {
  OPERATOR: "operator",
  AGENT: "agent",
} as const;

export type SpxTestRunMode = (typeof SPX_TEST_RUN_MODE)[keyof typeof SPX_TEST_RUN_MODE];

/** What the inert suite observed in its runner process, written as one JSON document. */
export interface RunRootObservation {
  /** The run root the runner process inherited through its environment. */
  readonly inheritedRoot?: string;
  /** The canonical path of the directory that holds the inherited root. */
  readonly inheritedRootParent?: string;
  /** The entries of that directory while the runner process ran. */
  readonly runRootsListing: readonly string[];
  /** A child process of the runner that requested one directory through the temp-directory primitive. */
  readonly child: TempDirectoryChildReport;
}

export interface SpxTestRun {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
  /** The canonical root of the product the command ran in. */
  readonly worktreeRoot: string;
  readonly observed: RunRootObservation;
  /** Whether the inherited run root still existed after the command exited. */
  readonly rootExistsAfterExit: boolean;
  /** The entries of the worktree's run-root directory after the command exited. */
  readonly runRootsAfterExit: readonly string[];
  /** The entries of the command's user temp folder after the command exited. */
  readonly userTempEntriesAfterExit: readonly string[];
}

const FIXTURE_TEMP_DIR_PREFIX = "spx-test-run-root-";
const PRODUCT_DIRECTORY_NAME = "product";
const USER_TEMP_DIRECTORY_NAME = "user-temp";
const OBSERVATION_FILE_NAME = "observation.json";
const OBSERVER_FIXTURE_PATH = fileURLToPath(
  new URL("../../fixtures/vitest/observes-run-temp-root.test.ts.fixture", import.meta.url),
);
const OBSERVED_NODE_DIRECTORY = "21-observed.capability";
const OBSERVED_TESTS_DIRECTORY = "tests";
const OBSERVED_SUITE_FILE_NAME = "observe.scenario.l1.test.ts";
const EMPTY_TSCONFIG_TEXT = "{}";
const PACKAGE_MANIFEST_FILE_NAME = "package.json";
const EMPTY_PACKAGE_MANIFEST_TEXT = "{}";
const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const TOOL_RUNNER_RELATIVE_PATH = ["node_modules", ".bin", "tsx"] as const;
const TSCONFIG_FLAG = "--tsconfig";
const CHILD_SCRIPT_PATH = fileURLToPath(new URL("./child.ts", import.meta.url));
const TEMP_FOLDER_ENV_KEY = "TMPDIR";
/**
 * Node's own module compile cache writes `node-compile-cache` into the process temp folder. Disabling it for
 * the staged command keeps that third-party cache out of the observed user temp folder, so every entry found
 * there was created by the product.
 */
const NODE_COMPILE_CACHE_DISABLE_ENV = { NODE_DISABLE_COMPILE_CACHE: "1" } as const;
/** The environment variable through which the inert suite learns its configuration. */
const OBSERVER_CONFIG_ENV_KEY = "RUN_TEMP_OBSERVER_CONFIG";
const NO_EXIT_CODE_MESSAGE = "spx test ended without an exit code";

async function entriesOf(directory: string): Promise<string[]> {
  return readdir(directory).catch(() => []);
}

/**
 * Runs `node bin/spx.js test` (with `--agent` in agent mode) over a staged product that holds the inert
 * run-root suite, and observes the filesystem after the command exits. Throws when the executable is not
 * built, the TypeScript runner is not installed, or the suite wrote no observation.
 */
export async function runSpxTestWithRunRootObserver(mode: SpxTestRunMode): Promise<SpxTestRun> {
  await access(BUILT_CLI_BUNDLE).catch(() => {
    throw new Error(`built spx executable not found at ${BUILT_CLI_BUNDLE}; run \`pnpm run build\` first`);
  });
  const toolRunner = join(PRODUCT_ROOT, ...TOOL_RUNNER_RELATIVE_PATH);
  if (!existsSync(toolRunner)) {
    throw new Error(`TypeScript runner not found at ${toolRunner}; run the package install first`);
  }

  return withTempDir(FIXTURE_TEMP_DIR_PREFIX, async (fixtureRoot) => {
    const productDir = join(fixtureRoot, PRODUCT_DIRECTORY_NAME);
    const userTempDir = join(fixtureRoot, USER_TEMP_DIRECTORY_NAME);
    const observationPath = join(fixtureRoot, OBSERVATION_FILE_NAME);
    const testsDir = join(
      productDir,
      SPEC_TREE_CONFIG.ROOT_DIRECTORY,
      OBSERVED_NODE_DIRECTORY,
      OBSERVED_TESTS_DIRECTORY,
    );

    await mkdir(testsDir, { recursive: true });
    await mkdir(userTempDir, { recursive: true });
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await linkProductRunnerToolchain(productDir);
    await writeFile(join(productDir, TYPESCRIPT_MARKER), EMPTY_TSCONFIG_TEXT);
    await writeFile(join(productDir, PACKAGE_MANIFEST_FILE_NAME), EMPTY_PACKAGE_MANIFEST_TEXT);
    await copyFile(OBSERVER_FIXTURE_PATH, join(testsDir, OBSERVED_SUITE_FILE_NAME));
    const worktreeRoot = await realpath(productDir);

    const env = buildGitTestEnvironment({
      [TEMP_FOLDER_ENV_KEY]: userTempDir,
      ...NODE_COMPILE_CACHE_DISABLE_ENV,
      [OBSERVER_CONFIG_ENV_KEY]: JSON.stringify({
        runRootEnvVar: TEMP_DIRECTORY_ENV_VAR.RUN_ROOT,
        observationPath,
        childCommand: toolRunner,
        childArguments: [
          TSCONFIG_FLAG,
          join(PRODUCT_ROOT, TYPESCRIPT_MARKER),
          CHILD_SCRIPT_PATH,
          TEMP_DIRECTORY_CHILD_MODE.CREATE,
        ],
        childEnvironment: { [TEMP_FOLDER_ENV_KEY]: tmpdir() },
      }),
    });
    delete env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];
    delete env[TEMP_DIRECTORY_ENV_VAR.GIT_CEILING_DIRECTORIES];

    const result = await execa(
      NODE_EXECUTABLE,
      [CLI_PATH, TESTING_CLI.commandName, ...(mode === SPX_TEST_RUN_MODE.AGENT ? [TESTING_CLI.agentOption] : [])],
      { cwd: productDir, env, extendEnv: false, reject: false },
    );

    const observationText = await readFile(observationPath, "utf8").catch(() => {
      throw new Error(
        `the inert suite wrote no observation (${
          result.exitCode ?? NO_EXIT_CODE_MESSAGE
        })\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    });
    const observed: RunRootObservation = JSON.parse(observationText);

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      worktreeRoot,
      observed,
      rootExistsAfterExit: observed.inheritedRoot !== undefined && existsSync(observed.inheritedRoot),
      runRootsAfterExit: await entriesOf(join(worktreeScopeDir(worktreeRoot), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR)),
      userTempEntriesAfterExit: await entriesOf(userTempDir),
    };
  });
}
