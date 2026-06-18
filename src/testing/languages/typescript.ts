/**
 * TypeScript test-runner descriptor.
 *
 * Declares vitest as the TypeScript test runner: detection gating, the vitest
 * test-file patterns, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import type {
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/testing/languages/types";
import { detectTypeScript } from "@/validation/discovery/language-finder";

const TYPESCRIPT_TESTING_LANGUAGE_NAME = "typescript";
const TYPESCRIPT_TEST_FILE_PATTERNS = ["*.test.ts", "*.test.tsx"] as const;
const TYPESCRIPT_TEST_FILE_SUFFIXES = [".test.ts", ".test.tsx"] as const;
const TYPESCRIPT_PRODUCT_INPUT_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
  "vitest.config.mts",
] as const;

/** vitest exclusion-flag format: an excluded node path maps to `--exclude=spx/{nodePath}/**`. */
export const TYPESCRIPT_VITEST_EXCLUDE_FLAG_PREFIX = "--exclude=spx/";
export const TYPESCRIPT_VITEST_EXCLUDE_FLAG_SUFFIX = "/**";

// vitest runs through the project's package manager so the project's node_modules
// provides the binary; `--root` makes the project under test explicit.
const PACKAGE_MANAGER_COMMAND = "pnpm";
const VITEST_INVOKE_ARGS = ["exec", "vitest", "run"] as const;
const VITEST_ROOT_FLAG = "--root";

function matchesTestFile(filePath: string): boolean {
  return TYPESCRIPT_TEST_FILE_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function excludeFlag(nodePath: string): string {
  return `${TYPESCRIPT_VITEST_EXCLUDE_FLAG_PREFIX}${nodePath}${TYPESCRIPT_VITEST_EXCLUDE_FLAG_SUFFIX}`;
}

function detect(projectRoot: string, deps?: Pick<TestRunnerDependencies, "isLanguagePresent">): boolean {
  return deps?.isLanguagePresent?.(projectRoot) ?? detectTypeScript(projectRoot).present;
}

async function runTests(request: TestRunRequest, deps: TestRunnerDependencies): Promise<TestRunInvocation> {
  if (!detect(request.projectRoot, deps)) {
    return { invoked: false };
  }

  const args = [
    ...VITEST_INVOKE_ARGS,
    VITEST_ROOT_FLAG,
    request.projectRoot,
    ...request.testPaths,
    ...request.excludedNodePaths.map(excludeFlag),
  ];

  const result = await deps.runCommand(PACKAGE_MANAGER_COMMAND, args);
  return {
    invoked: true,
    exitCode: result.exitCode,
    ...(result.output === undefined ? {} : { output: result.output }),
  };
}

export const typescriptTestingLanguage: TestingLanguageDescriptor = {
  name: TYPESCRIPT_TESTING_LANGUAGE_NAME,
  testFilePatterns: TYPESCRIPT_TEST_FILE_PATTERNS,
  productInputPaths: TYPESCRIPT_PRODUCT_INPUT_PATHS,
  matchesTestFile,
  excludeFlag,
  detect,
  runTests,
};
