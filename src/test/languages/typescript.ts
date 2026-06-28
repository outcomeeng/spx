/**
 * TypeScript test-runner descriptor.
 *
 * Declares vitest as the TypeScript test runner: detection gating, the vitest
 * test-file patterns, pure exclusion-flag generation, and invocation through an
 * injected command runner. Composing descriptors into a registry and dispatching
 * the `spx test` command are separate, higher-level concerns.
 */
import { posix } from "node:path";

import ts from "typescript";

import type {
  RelatedTestDependencies,
  RelatedTestRequest,
  RelatedTestResolution,
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/test/languages/types";
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
const TYPESCRIPT_SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;
const TYPESCRIPT_RUNTIME_EXTENSION_MAP = {
  ".js": ".ts",
  ".jsx": ".tsx",
} as const;
const TYPESCRIPT_ALIAS_PREFIXES = [
  { prefix: "@/", target: "src/" },
  { prefix: "@testing/", target: "testing/" },
  { prefix: "@root/", target: "" },
  { prefix: "@scripts/", target: "scripts/" },
  { prefix: "@eslint-rules/", target: "eslint-rules/" },
] as const;

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

function moduleSpecifierText(node: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
  const specifier = node.moduleSpecifier;
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : null;
}

function importSpecifiers(sourceText: string, testPath: string): readonly string[] {
  const sourceFile = ts.createSourceFile(testPath, sourceText, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      const specifier = moduleSpecifierText(statement);
      if (specifier !== null) specifiers.push(specifier);
    }
  }
  return specifiers;
}

function normalizedImportPath(testPath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return posix.normalize(posix.join(posix.dirname(testPath), specifier));
  }
  const alias = TYPESCRIPT_ALIAS_PREFIXES.find((candidate) => specifier.startsWith(candidate.prefix));
  return alias === undefined ? null : posix.normalize(`${alias.target}${specifier.slice(alias.prefix.length)}`);
}

function indexImportCandidates(normalized: string): readonly string[] {
  return TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) => `${normalized}/index${extension}`);
}

function candidateImportPaths(testPath: string, specifier: string): readonly string[] {
  const normalized = normalizedImportPath(testPath, specifier);
  if (normalized === null) return [];
  if (TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    const runtimeExtension = Object.keys(TYPESCRIPT_RUNTIME_EXTENSION_MAP).find((extension) =>
      normalized.endsWith(extension)
    );
    if (runtimeExtension === undefined) return [normalized];
    return [
      normalized,
      `${normalized.slice(0, -runtimeExtension.length)}${
        TYPESCRIPT_RUNTIME_EXTENSION_MAP[runtimeExtension as keyof typeof TYPESCRIPT_RUNTIME_EXTENSION_MAP]
      }`,
    ];
  }
  return [
    normalized,
    ...TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) => `${normalized}${extension}`),
    ...indexImportCandidates(normalized),
  ];
}

function isProductRelativePath(path: string): boolean {
  return path !== ".." && !path.startsWith("../");
}

function isConcreteSourcePath(path: string): boolean {
  return TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isTraversableHelperPath(path: string): boolean {
  return path.startsWith("spx/") || path.startsWith("testing/")
    || (path.startsWith("src/") && path.endsWith("/index.ts"));
}

function matchedChangedSources(
  testPath: string,
  sourceText: string,
  sourcePaths: ReadonlySet<string>,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: Map<string, Promise<string | null>>,
): Promise<readonly string[]> {
  const matched = new Set<string>();
  const visited = new Set<string>();

  async function visit(importerPath: string, importerText: string): Promise<void> {
    if (visited.has(importerPath)) return;
    visited.add(importerPath);
    for (const specifier of importSpecifiers(importerText, importerPath)) {
      const candidates = candidateImportPaths(importerPath, specifier).filter(isProductRelativePath);
      const directMatches = candidates.filter((candidate) => sourcePaths.has(candidate));
      if (directMatches.length > 0) {
        for (const candidate of directMatches) matched.add(candidate);
        continue;
      }
      for (const candidate of candidates) {
        if (!isConcreteSourcePath(candidate) || !isTraversableHelperPath(candidate)) continue;
        const candidateText = await readCandidateModule(candidate, deps, moduleTextCache);
        if (candidateText !== null) {
          await visit(candidate, candidateText);
        }
      }
    }
  }

  return visit(testPath, sourceText).then(() => [...matched]);
}

async function readCandidateModule(
  path: string,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: Map<string, Promise<string | null>>,
): Promise<string | null> {
  const cached = moduleTextCache.get(path);
  if (cached !== undefined) return cached;
  const loaded = deps.readFile(path).catch(() => null);
  moduleTextCache.set(path, loaded);
  return loaded;
}

async function readCandidateTest(
  path: string,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: Map<string, Promise<string | null>>,
): Promise<string> {
  const cached = moduleTextCache.get(path);
  if (cached !== undefined) {
    const text = await cached;
    if (text !== null) return text;
  }
  const loaded = deps.readFile(path);
  moduleTextCache.set(path, loaded);
  return loaded;
}

function directChangedSources(
  testPath: string,
  sourceText: string,
  sourcePaths: ReadonlySet<string>,
): readonly string[] {
  const matched = new Set<string>();
  for (const specifier of importSpecifiers(sourceText, testPath)) {
    for (const candidate of candidateImportPaths(testPath, specifier)) {
      if (sourcePaths.has(candidate)) matched.add(candidate);
    }
  }
  return [...matched];
}

async function relatedTestPaths(
  request: RelatedTestRequest,
  deps: RelatedTestDependencies,
): Promise<RelatedTestResolution> {
  if (!detect(request.projectRoot, deps)) {
    return { testPaths: [], resolvedSourcePaths: [] };
  }
  const sourcePaths = new Set(request.sourcePaths);
  const testPaths: string[] = [];
  const resolvedSourcePaths = new Set<string>();
  const moduleTextCache = new Map<string, Promise<string | null>>();
  for (const testPath of request.candidateTestPaths.filter(matchesTestFile)) {
    const sourceText = await readCandidateTest(testPath, deps, moduleTextCache);
    const matchedSources = [
      ...new Set([
        ...directChangedSources(testPath, sourceText, sourcePaths),
        ...await matchedChangedSources(testPath, sourceText, sourcePaths, deps, moduleTextCache),
      ]),
    ];
    if (matchedSources.length > 0) {
      testPaths.push(testPath);
      for (const sourcePath of matchedSources) resolvedSourcePaths.add(sourcePath);
    }
  }
  return { testPaths, resolvedSourcePaths: [...resolvedSourcePaths] };
}

export const typescriptTestingLanguage: TestingLanguageDescriptor = {
  name: TYPESCRIPT_TESTING_LANGUAGE_NAME,
  testFilePatterns: TYPESCRIPT_TEST_FILE_PATTERNS,
  productInputPaths: TYPESCRIPT_PRODUCT_INPUT_PATHS,
  matchesTestFile,
  excludeFlag,
  detect,
  runTests,
  relatedTestPaths,
};
