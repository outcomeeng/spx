/**
 * Python test-runner descriptor.
 *
 * Declares pytest as the Python test runner: detection gating, the pytest
 * test-file pattern, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import { basename, dirname, join } from "node:path/posix";

import { compareAsciiStrings } from "@/lib/state-store";
import type {
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/test/languages/types";
import { detectPython } from "@/validation/discovery/language-finder";
import {
  PYTEST_INVOKE_ARGS,
  PYTHON_PYTEST_IGNORE_FLAG_PREFIX,
  PYTHON_PYTEST_IGNORE_FLAG_SUFFIX,
  UV_COMMAND,
} from "./python-pytest-contract";

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

function detect(productDir: string, deps?: Pick<TestRunnerDependencies, "isLanguagePresent">): boolean {
  return deps?.isLanguagePresent?.(productDir) ?? detectPython(productDir).present;
}

async function runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation> {
  if (!detect(request.productDir, deps)) {
    return { invoked: false };
  }

  const args = [
    ...PYTEST_INVOKE_ARGS,
    ...request.testPaths,
    ...request.excludedNodePaths.map(excludeFlag),
  ];

  const result = await deps.runCommand(UV_COMMAND, args);
  return {
    invoked: true,
    exitCode: result.exitCode,
    ...(result.output === undefined ? {} : { output: result.output }),
  };
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
