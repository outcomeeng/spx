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

import { TEST_RELEVANT_SOURCE_ROOT_PREFIXES } from "@/config/source-roots";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  createVitestRunStarter,
  runTestsStreaming as reporterRunTestsStreaming,
  type VitestRunStarter,
} from "@/test/languages/journal-reporter";
import type {
  JournalRunInvocation,
  JournalRunRequest,
  JournalStreamRunDependencies,
  RelatedTestDependencies,
  RelatedTestRequest,
  RelatedTestResolution,
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunnerDependencies,
  TestRunRequest,
} from "@/test/languages/types";
import { detectTypeScript, TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";

const TYPESCRIPT_TESTING_LANGUAGE_NAME = "typescript";
export const TYPESCRIPT_TEST_FILE_SUFFIXES = [".test.ts", ".test.tsx"] as const;
export const TYPESCRIPT_TEST_FILE_PATTERNS: readonly string[] = TYPESCRIPT_TEST_FILE_SUFFIXES.map((suffix) =>
  `*${suffix}`
);
const TYPESCRIPT_PRODUCT_INPUT_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  TYPESCRIPT_MARKER,
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
const SPEC_TREE_SOURCE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;
const TYPESCRIPT_RUNTIME_EXTENSION_MAP = {
  ".js": ".ts",
  ".jsx": ".tsx",
} as const;
const TSCONFIG_COMPILER_OPTIONS_KEY = "compilerOptions";
const TSCONFIG_PATHS_KEY = "paths";
const TSCONFIG_WILDCARD_SUFFIX = "*";
const TSCONFIG_CURRENT_DIRECTORY_PREFIX = "./";
const NOT_FOUND_ERROR_CODE = "ENOENT";

interface TypeScriptPathMapping {
  readonly aliasPrefix: string;
  readonly aliasSuffix: string;
  readonly hasWildcard: boolean;
  readonly targets: readonly string[];
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object"
    && error !== null
    && !Array.isArray(error)
    && "code" in error
    && (error as { readonly code?: unknown }).code === code
  );
}

function wildcardIndex(value: string): number {
  return value.indexOf(TSCONFIG_WILDCARD_SUFFIX);
}

function splitTsconfigPattern(
  value: string,
): { readonly prefix: string; readonly suffix: string; readonly hasWildcard: boolean } {
  const index = wildcardIndex(value);
  if (index < 0) return { prefix: value, suffix: "", hasWildcard: false };
  return {
    prefix: value.slice(0, index),
    suffix: value.slice(index + TSCONFIG_WILDCARD_SUFFIX.length),
    hasWildcard: true,
  };
}

function normalizeTsconfigTarget(target: string, wildcardValue: string): string {
  const substituted = target.replace(TSCONFIG_WILDCARD_SUFFIX, wildcardValue);
  return substituted.startsWith(TSCONFIG_CURRENT_DIRECTORY_PREFIX)
    ? substituted.slice(TSCONFIG_CURRENT_DIRECTORY_PREFIX.length)
    : substituted;
}

function pathMappingFromTsconfigPath(pathAlias: string, targets: unknown): TypeScriptPathMapping | null {
  if (!Array.isArray(targets)) return null;
  const stringTargets = targets.filter((target): target is string => typeof target === "string");
  if (stringTargets.length === 0) return null;
  const alias = splitTsconfigPattern(pathAlias);
  return {
    aliasPrefix: alias.prefix,
    aliasSuffix: alias.suffix,
    hasWildcard: alias.hasWildcard,
    targets: stringTargets,
  };
}

function pathMappingsFromTsconfig(config: unknown): readonly TypeScriptPathMapping[] {
  if (!isRecord(config)) return [];
  const compilerOptions = config[TSCONFIG_COMPILER_OPTIONS_KEY];
  if (!isRecord(compilerOptions)) return [];
  const paths = compilerOptions[TSCONFIG_PATHS_KEY];
  if (!isRecord(paths)) return [];
  return Object.entries(paths).flatMap(([pathAlias, targets]) => {
    const mapping = pathMappingFromTsconfigPath(pathAlias, targets);
    return mapping === null ? [] : [mapping];
  });
}

async function typescriptPathMappings(
  deps: Pick<RelatedTestDependencies, "readFile">,
): Promise<readonly TypeScriptPathMapping[]> {
  const tsconfigText = await deps.readFile(TYPESCRIPT_MARKER);
  const parsed = ts.parseConfigFileTextToJson(TYPESCRIPT_MARKER, tsconfigText);
  if (parsed.error !== undefined) {
    throw new Error(`failed to parse ${TYPESCRIPT_MARKER}`);
  }
  return pathMappingsFromTsconfig(parsed.config);
}

function normalizedImportPath(
  testPath: string,
  specifier: string,
  mappings: readonly TypeScriptPathMapping[],
): readonly string[] {
  if (specifier.startsWith(".")) {
    return [posix.normalize(posix.join(posix.dirname(testPath), specifier))];
  }
  return mappings.flatMap((mapping) => normalizedPathsFromMapping(mapping, specifier));
}

function normalizedPathsFromMapping(mapping: TypeScriptPathMapping, specifier: string): readonly string[] {
  if (!mapping.hasWildcard) {
    return specifier === mapping.aliasPrefix
      ? mapping.targets.map((target) => posix.normalize(normalizeTsconfigTarget(target, "")))
      : [];
  }
  if (!specifier.startsWith(mapping.aliasPrefix) || !specifier.endsWith(mapping.aliasSuffix)) return [];
  const wildcardValue = specifier.slice(mapping.aliasPrefix.length, specifier.length - mapping.aliasSuffix.length);
  return mapping.targets.map((target) => posix.normalize(normalizeTsconfigTarget(target, wildcardValue)));
}

function indexImportCandidates(normalized: string): readonly string[] {
  return TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) => `${normalized}/index${extension}`);
}

function candidateImportPaths(
  testPath: string,
  specifier: string,
  mappings: readonly TypeScriptPathMapping[],
): readonly string[] {
  return normalizedImportPath(testPath, specifier, mappings).flatMap(expandedImportCandidates);
}

function expandedImportCandidates(normalized: string): readonly string[] {
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

function isTraversableModulePath(path: string): boolean {
  return TEST_RELEVANT_SOURCE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))
    || path.startsWith(SPEC_TREE_SOURCE_ROOT_PREFIX);
}

type ModuleTextCache = Map<string, Promise<string | null>>;
type ReachabilityCache = Map<string, Promise<readonly string[]>>;

async function changedSourcesReachableFromText(
  importerPath: string,
  importerText: string,
  sourcePaths: ReadonlySet<string>,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: ModuleTextCache,
  reachabilityCache: ReachabilityCache,
  visiting: ReadonlySet<string>,
  mappings: readonly TypeScriptPathMapping[],
): Promise<readonly string[]> {
  const matched = new Set<string>();

  for (const specifier of importSpecifiers(importerText, importerPath)) {
    const candidates = candidateImportPaths(importerPath, specifier, mappings).filter(isProductRelativePath);
    const directMatches = candidates.filter((candidate) => sourcePaths.has(candidate));
    for (const candidate of directMatches) matched.add(candidate);
    for (const candidate of candidates) {
      if (!isConcreteSourcePath(candidate) || !isTraversableModulePath(candidate)) continue;
      for (
        const sourcePath of await changedSourcesReachableFromPath(
          candidate,
          sourcePaths,
          deps,
          moduleTextCache,
          reachabilityCache,
          visiting,
          mappings,
        )
      ) {
        matched.add(sourcePath);
      }
    }
  }

  return [...matched];
}

async function changedSourcesReachableFromPath(
  path: string,
  sourcePaths: ReadonlySet<string>,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: ModuleTextCache,
  reachabilityCache: ReachabilityCache,
  visiting: ReadonlySet<string>,
  mappings: readonly TypeScriptPathMapping[],
): Promise<readonly string[]> {
  if (visiting.has(path)) return [];
  const cached = reachabilityCache.get(path);
  if (cached !== undefined) return cached;

  const reachable = readCandidateModule(path, deps, moduleTextCache).then((sourceText) => {
    if (sourceText === null) return [];
    return changedSourcesReachableFromText(
      path,
      sourceText,
      sourcePaths,
      deps,
      moduleTextCache,
      reachabilityCache,
      new Set([
        ...visiting,
        path,
      ]),
      mappings,
    );
  });
  reachabilityCache.set(path, reachable);
  return reachable;
}

async function readCandidateModule(
  path: string,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: ModuleTextCache,
): Promise<string | null> {
  const cached = moduleTextCache.get(path);
  if (cached !== undefined) return cached;
  const loaded = deps.readFile(path).catch((error: unknown) => {
    if (hasErrorCode(error, NOT_FOUND_ERROR_CODE)) return null;
    throw error;
  });
  moduleTextCache.set(path, loaded);
  return loaded;
}

async function readCandidateTest(
  path: string,
  deps: Pick<RelatedTestDependencies, "readFile">,
  moduleTextCache: ModuleTextCache,
): Promise<string | null> {
  const cached = moduleTextCache.get(path);
  if (cached !== undefined) {
    const text = await cached;
    if (text !== null) return text;
  }
  const loaded = deps.readFile(path).catch((error: unknown) => {
    if (hasErrorCode(error, NOT_FOUND_ERROR_CODE)) return null;
    throw error;
  });
  moduleTextCache.set(path, loaded);
  return loaded;
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
  const reachabilityCache = new Map<string, Promise<readonly string[]>>();
  const mappings = await typescriptPathMappings(deps);
  for (const testPath of request.candidateTestPaths.filter(matchesTestFile)) {
    const sourceText = await readCandidateTest(testPath, deps, moduleTextCache);
    if (sourceText === null) continue;
    const matchedSources = await changedSourcesReachableFromText(
      testPath,
      sourceText,
      sourcePaths,
      deps,
      moduleTextCache,
      reachabilityCache,
      new Set([testPath]),
      mappings,
    );
    if (matchedSources.length > 0) {
      testPaths.push(testPath);
      for (const sourcePath of matchedSources) resolvedSourcePaths.add(sourcePath);
    }
  }
  return { testPaths, resolvedSourcePaths: [...resolvedSourcePaths] };
}

/**
 * Drives the TypeScript journal-streaming run, gated on detection like `runTests`: when
 * TypeScript is absent the run is gated out with no Vitest invoked. Otherwise it delegates
 * the programmatic Vitest run and its reporter to `runTestsStreaming` in `./journal-reporter`,
 * streaming per-module scope and per-failing-case findings into the injected sink and yielding
 * the run's terminal status. The production Vitest run-starter is the default; an injected
 * starter lets `l1` tests drive synthetic lifecycle events without a real Vitest run. Widening
 * the descriptor's `{ sink }` dependency to `{ sink, starter? }` conforms to the neutral
 * `TestingLanguageDescriptor` contract while exposing the starter seam TypeScript verification needs.
 */
export async function runTestsStreaming(
  request: JournalRunRequest,
  deps: JournalStreamRunDependencies & { readonly starter?: VitestRunStarter },
): Promise<JournalRunInvocation> {
  if (!detect(request.projectRoot, deps)) {
    return { invoked: false };
  }
  const terminalStatus = await reporterRunTestsStreaming(request, {
    sink: deps.sink,
    starter: deps.starter ?? createVitestRunStarter(),
  });
  return { invoked: true, terminalStatus };
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
  runTestsStreaming,
};
