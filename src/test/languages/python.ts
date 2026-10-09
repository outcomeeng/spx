/**
 * Python test-runner descriptor.
 *
 * Declares pytest as the Python test runner: detection gating, the pytest
 * test-file pattern, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import { readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path/posix";

import { compareAsciiStrings, domainDir, generateRunId, STATE_STORE_DOMAIN, worktreeScopeDir } from "@/lib/state-store";
import type {
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/test/languages/types";
import { TEST_PATH_VERDICT, type TestPathVerdict } from "@/test/run-state";
import { detectPython } from "@/validation/discovery/language-finder";
import {
  JUNIT_REPORT_DIRECTORY,
  JUNIT_REPORT_FILE_PREFIX,
  JUNIT_REPORT_FILE_SUFFIX,
  JUNIT_REPORT_FLAG_PREFIX,
  JUNIT_REPORT_TEXT_ENCODING,
  JUNIT_UNREADABLE_REPORT_EXIT_CODE,
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

const JUNIT_TAG_PATTERN = /<(\/?)(testcase|failure|error)\b([^>]*?)(\/?)>/g;
const JUNIT_CLASSNAME_PATTERN = /\bclassname="([^"]*)"/;
const JUNIT_NAME_PATTERN = /\bname="([^"]*)"/;
const JUNIT_SUITE_MARKER = "<testsuite";
const JUNIT_TESTCASE_TAG = "testcase";
const CLOSING_SLASH = "/";
const MODULE_SEPARATOR = ".";
const PATH_SEPARATOR = "/";
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;
const PYTHON_SOURCE_SUFFIX_PATTERN = /\.py$/;

interface JunitTestCase {
  readonly classname: string;
  readonly name: string;
  failed: boolean;
}

function junitReportPath(productDir: string): string {
  const domain = domainDir(worktreeScopeDir(productDir), STATE_STORE_DOMAIN.TEST);
  if (!domain.ok) throw new Error(domain.error);
  return join(
    domain.value,
    JUNIT_REPORT_DIRECTORY,
    `${JUNIT_REPORT_FILE_PREFIX}${generateRunId()}${JUNIT_REPORT_FILE_SUFFIX}`,
  );
}

/** The testcases of a pytest JUnit XML report, or `null` when the text is not such a report. */
function junitTestCases(reportText: string): readonly JunitTestCase[] | null {
  if (!reportText.includes(JUNIT_SUITE_MARKER)) return null;
  const cases: JunitTestCase[] = [];
  let open: JunitTestCase | undefined;
  for (const match of reportText.matchAll(JUNIT_TAG_PATTERN)) {
    const [, closing, tag, attributes = "", selfClosing] = match;
    if (tag === JUNIT_TESTCASE_TAG) {
      if (closing === CLOSING_SLASH) {
        open = undefined;
        continue;
      }
      const testCase: JunitTestCase = {
        classname: JUNIT_CLASSNAME_PATTERN.exec(attributes)?.[1] ?? "",
        name: JUNIT_NAME_PATTERN.exec(attributes)?.[1] ?? "",
        failed: false,
      };
      cases.push(testCase);
      open = selfClosing === CLOSING_SLASH ? undefined : testCase;
    } else if (open !== undefined && closing !== CLOSING_SLASH) {
      open.failed = true;
    }
  }
  return cases;
}

function moduleIdentity(testPath: string, productDir: string): string {
  const slashed = testPath.replace(WINDOWS_PATH_SEPARATOR_PATTERN, PATH_SEPARATOR);
  const productPrefix = `${productDir.replace(WINDOWS_PATH_SEPARATOR_PATTERN, PATH_SEPARATOR)}${PATH_SEPARATOR}`;
  const relative = slashed.startsWith(productPrefix) ? slashed.slice(productPrefix.length) : slashed;
  return relative.replace(PYTHON_SOURCE_SUFFIX_PATTERN, "").split(PATH_SEPARATOR).join(MODULE_SEPARATOR);
}

function belongsToModule(testCase: JunitTestCase, moduleId: string): boolean {
  const collectionIdentity = testCase.classname === ""
    ? testCase.name
    : `${testCase.classname}${MODULE_SEPARATOR}${testCase.name}`;
  return testCase.classname === moduleId
    || testCase.classname.startsWith(`${moduleId}${MODULE_SEPARATOR}`)
    || collectionIdentity === moduleId;
}

/** One verdict per supplied path from pytest's JUnit XML report, or `null` when the report is unreadable. */
function pathVerdictsFromReport(
  reportText: string | null,
  productDir: string,
  testPaths: readonly string[],
): readonly TestPathVerdict[] | null {
  if (reportText === null) return null;
  const cases = junitTestCases(reportText);
  if (cases === null) return null;
  return testPaths.map((testPath) => {
    const moduleId = moduleIdentity(testPath, productDir);
    const moduleCases = cases.filter((testCase) => belongsToModule(testCase, moduleId));
    if (moduleCases.length === 0) return { testPath, verdict: TEST_PATH_VERDICT.NOT_RUN };
    return {
      testPath,
      verdict: moduleCases.some((testCase) => testCase.failed) ? TEST_PATH_VERDICT.FAILED : TEST_PATH_VERDICT.PASSED,
    };
  });
}

async function readReportText(
  reportPath: string,
  deps: Pick<TestRunnerDependencies, "readReport">,
): Promise<string | null> {
  try {
    return await (deps.readReport ?? ((path) => readFile(path, JUNIT_REPORT_TEXT_ENCODING)))(reportPath);
  } catch {
    return null;
  }
}

async function runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation> {
  if (!detect(request.productDir, deps)) {
    return { invoked: false };
  }

  const reportPath = junitReportPath(request.productDir);
  const args = [
    ...PYTEST_INVOKE_ARGS,
    `${JUNIT_REPORT_FLAG_PREFIX}${reportPath}`,
    ...request.testPaths,
    ...request.excludedNodePaths.map(excludeFlag),
  ];

  const result = await deps.runCommand(UV_COMMAND, args);
  const pathVerdicts = pathVerdictsFromReport(
    await readReportText(reportPath, deps),
    request.productDir,
    request.testPaths,
  );
  await (deps.removeReport ?? ((path) => rm(path, { force: true })))(reportPath);
  return {
    invoked: true,
    exitCode: pathVerdicts === null && result.exitCode === 0 ? JUNIT_UNREADABLE_REPORT_EXIT_CODE : result.exitCode,
    ...(pathVerdicts === null ? {} : { pathVerdicts }),
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
