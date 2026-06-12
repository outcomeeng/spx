/**
 * Python test-runner descriptor.
 *
 * Declares pytest as the Python test runner: detection gating, the pytest
 * test-file pattern, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import { basename, dirname, join } from "node:path/posix";

import type {
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/testing/languages/types";

const PYTHON_TESTING_LANGUAGE_NAME = "python";
export const PYTHON_PRODUCT_INPUT_PATH = {
  CONFTEST: "conftest.py",
  HIDDEN_PYTEST_INI: ".pytest.ini",
  HIDDEN_PYTEST_TOML: ".pytest.toml",
  PYPROJECT: "pyproject.toml",
  PYTEST_TOML: "pytest.toml",
  PYTEST_INI: "pytest.ini",
  SETUP_CFG: "setup.cfg",
  SETUP_PY: "setup.py",
  TOX_INI: "tox.ini",
  UV_LOCK: "uv.lock",
} as const;
const PYTHON_PRODUCT_INPUT_PATHS = Object.values(PYTHON_PRODUCT_INPUT_PATH);

/** pytest test-file basename shape: a `test_` prefix and a `.py` extension. */
export const PYTHON_TEST_FILE_PREFIX = "test_";
const PYTHON_TEST_FILE_EXTENSION = ".py";
const PYTHON_TEST_FILE_PATTERNS = [`${PYTHON_TEST_FILE_PREFIX}*${PYTHON_TEST_FILE_EXTENSION}`] as const;

/** pytest exclusion-flag format: an excluded node path maps to `--ignore=spx/{nodePath}/`. */
export const PYTHON_PYTEST_IGNORE_FLAG_PREFIX = "--ignore=spx/";
export const PYTHON_PYTEST_IGNORE_FLAG_SUFFIX = "/";

// pytest runs through `uv run` so the project's managed Python environment provides the tool;
// pytest takes its rootdir, configuration, and environment from the command runner's working directory.
const UV_COMMAND = "uv";
// Exported so a provisioning harness can locate the `pytest` command token structurally rather than
// hardcoding its position when it splices an ephemeral `--with pytest`.
export const PYTEST_INVOKE_ARGS = ["run", "pytest"] as const;

function matchesTestFile(filePath: string): boolean {
  return basename(filePath).startsWith(PYTHON_TEST_FILE_PREFIX) && filePath.endsWith(PYTHON_TEST_FILE_EXTENSION);
}

function coveredProductInputPaths(coveredTestPaths: readonly string[]): readonly string[] {
  const paths = new Set<string>();
  for (const testPath of coveredTestPaths) {
    if (!matchesTestFile(testPath)) continue;
    let directory = dirname(testPath);
    while (directory !== "." && directory.length > 0) {
      paths.add(join(directory, PYTHON_PRODUCT_INPUT_PATH.CONFTEST));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return [...paths].sort(compareAsciiStrings);
}

function excludeFlag(nodePath: string): string {
  return `${PYTHON_PYTEST_IGNORE_FLAG_PREFIX}${nodePath}${PYTHON_PYTEST_IGNORE_FLAG_SUFFIX}`;
}

function detect(projectRoot: string, deps: Pick<TestRunnerDependencies, "isLanguagePresent">): boolean {
  return deps.isLanguagePresent(projectRoot);
}

async function runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation> {
  if (!deps.isLanguagePresent(request.projectRoot)) {
    return { invoked: false };
  }

  const args = [
    ...PYTEST_INVOKE_ARGS,
    ...request.testPaths,
    ...request.excludedNodePaths.map(excludeFlag),
  ];

  const result = await deps.runCommand(UV_COMMAND, args);
  return { invoked: true, exitCode: result.exitCode };
}

export const pythonTestingLanguage: TestingLanguageDescriptor = {
  name: PYTHON_TESTING_LANGUAGE_NAME,
  testFilePatterns: PYTHON_TEST_FILE_PATTERNS,
  productInputPaths: PYTHON_PRODUCT_INPUT_PATHS,
  coveredProductInputPaths,
  matchesTestFile,
  excludeFlag,
  detect,
  runTests,
};

function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
