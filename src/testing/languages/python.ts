/**
 * Python test-runner descriptor.
 *
 * Declares pytest as the Python test runner: detection gating, the pytest
 * test-file pattern, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import { basename } from "node:path";

import type {
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/testing/languages/types";

const PYTHON_TESTING_LANGUAGE_NAME = "python";

/** pytest test-file basename shape: a `test_` prefix and a `.py` extension. */
const PYTHON_TEST_FILE_PREFIX = "test_";
const PYTHON_TEST_FILE_EXTENSION = ".py";
const PYTHON_TEST_FILE_PATTERNS = [`${PYTHON_TEST_FILE_PREFIX}*${PYTHON_TEST_FILE_EXTENSION}`] as const;

/** pytest exclusion-flag format: an excluded node path maps to `--ignore=spx/{nodePath}/`. */
export const PYTHON_PYTEST_IGNORE_FLAG_PREFIX = "--ignore=spx/";
export const PYTHON_PYTEST_IGNORE_FLAG_SUFFIX = "/";

// pytest runs through `uv run` so the project's managed Python environment provides the tool;
// pytest takes its rootdir, configuration, and environment from the command runner's working directory.
const UV_COMMAND = "uv";
const PYTEST_INVOKE_ARGS = ["run", "pytest"] as const;

function matchesTestFile(filePath: string): boolean {
  return basename(filePath).startsWith(PYTHON_TEST_FILE_PREFIX) && filePath.endsWith(PYTHON_TEST_FILE_EXTENSION);
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
  matchesTestFile,
  excludeFlag,
  detect,
  runTests,
};
