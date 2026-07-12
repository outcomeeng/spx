import { expect, it } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";

import { basename, dirname, extname, join, matchesGlob } from "node:path/posix";

import type { ICruiseResult, IDependency, IModule, IReporterOutput } from "dependency-cruiser";

import type { ParsedCommandLine } from "typescript";

import { circularCommand, type CircularCommandDeps } from "@/commands/validation/circular";

import {
  formatExplicitPathsNoTargetsSkipMessage,
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";

import { CONFIG_FILENAMES } from "@/config/index";

import { validationCliDefinition } from "@/interfaces/cli/validation-contract";

import {
  TSCONFIG_FILES,
  TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX,
  typeScriptScopePatternIntersectsDirectory,
} from "@/validation/config/scope";

import {
  CIRCULAR_DEPS_KEYS,
  type CircularDependencyGraphRunner,
  type CircularDeps,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES,
  DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
  DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
  DEPENDENCY_CRUISER_PATH_PREFIX_PATTERN,
  DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES,
  validateCircularDependencies,
} from "@/validation/steps/circular";

import { type ScopeConfig, VALIDATION_SCOPES } from "@/validation/types";

import {
  arbitraryDomainLiteral,
  sampleDistinctSourceFilePaths,
  sampleDistinctTestFilePaths,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

import {
  VALIDATION_PIPELINE_DATA,
  validationCliPackagedExecutablePath,
} from "@testing/generators/validation/validation";

import { runValidationSubprocess } from "@testing/harnesses/validation/cli";

import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const productDir = process.cwd();

const [sourceModule, targetModule] = sampleSourceModulePair();

const analyzeDirectory = dirname(sourceModule);

const nonTypeScriptSourceFile = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.markdownOnlyFileName,
);

const extensionlessSourceFile = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.extensionlessSourceFileName,
);

const dottedSourceDirectory = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.dottedSourceDirectoryName,
);

const declarationSourceFile = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.declarationSourceFileName,
);

const modernTypeScriptSourceFile = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.modernSourceFileName,
);

const dotPrefixedRootTypeScriptFile = VALIDATION_PIPELINE_DATA.dotPrefixedRootSourceFileName;

const missingSourceDirectory = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.missingSourceDirectoryName,
);

const outOfRootRelativeSourceFile = join(
  "..",
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.cleanSourceFileName,
);

const dotSegmentedRootSourceFile =
  `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/../${VALIDATION_PIPELINE_DATA.cleanSourceFileName}`;

const rootTypeScriptFilePattern = VALIDATION_PIPELINE_DATA.rootTypeScriptSourceFilePattern;

const emptyTypescriptConfig: ParsedCommandLine = {
  options: {},
  fileNames: [],
  errors: [],
};

const typescriptScope: ScopeConfig = {
  directories: [analyzeDirectory],
  filePatterns: [],
  excludePatterns: [],
};

function sampleSourceModulePair(): readonly [string, string] {
  const [first, second] = sampleDistinctSourceFilePaths(2);
  return [first, second];
}

function createCruiseResult(dependency: IDependency): ICruiseResult {
  const module: IModule = {
    source: sourceModule,
    dependencies: [dependency],
    dependents: [],
    valid: true,
  };

  return {
    modules: [module],
    summary: {
      error: 0,
      ignore: 0,
      info: 0,
      optionsUsed: {},
      totalCruised: 1,
      totalDependenciesCruised: 1,
      violations: [],
      warn: 0,
    },
  };
}

function createEmptyCruiseResult(): ICruiseResult {
  return {
    modules: [],
    summary: {
      error: 0,
      ignore: 0,
      info: 0,
      optionsUsed: {},
      totalCruised: 0,
      totalDependenciesCruised: 0,
      violations: [],
      warn: 0,
    },
  };
}

function createCircularDependency(dependencyTypes: IDependency["dependencyTypes"]): IDependency {
  return {
    circular: true,
    coreModule: false,
    couldNotResolve: false,
    dependencyTypes,
    dynamic: false,
    exoticallyRequired: false,
    followable: true,
    instability: 0,
    mimeType: "",
    module: targetModule,
    moduleSystem: "es6",
    protocol: "file:",
    resolved: targetModule,
    valid: true,
  };
}

function createCircularDependencyWithCycle(
  initialDependencyTypes: IDependency["dependencyTypes"],
  targetDependencyTypes: IDependency["dependencyTypes"],
): IDependency {
  const dependency = createCircularDependency(initialDependencyTypes);
  dependency.cycle = [
    {
      name: targetModule,
      dependencyTypes: targetDependencyTypes,
    },
    {
      name: sourceModule,
      dependencyTypes: [
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
      ],
    },
  ];
  return dependency;
}

function expectRuntimeCycle(result: Awaited<ReturnType<typeof validateCircularDependencies>>): void {
  expect(result).toEqual({
    success: false,
    error: "Found 1 circular dependency cycle(s)",
    circularDependencies: [[sourceModule, targetModule, sourceModule]],
  });
}

function createDeps(cruiseResult: ICruiseResult): CircularDeps {
  return {
    [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (): Promise<IReporterOutput> => ({
      exitCode: 0,
      output: cruiseResult,
    }),
    [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: () => emptyTypescriptConfig,
  };
}

function createRecordingDeps(cruiseResult: ICruiseResult = createEmptyCruiseResult()): {
  readonly dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[];
  readonly deps: CircularDeps;
} {
  const dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[] = [];
  return {
    dependencyGraphCalls,
    deps: {
      [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (...call): Promise<IReporterOutput> => {
        dependencyGraphCalls.push(call);
        return {
          exitCode: 0,
          output: cruiseResult,
        };
      },
      [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: () => emptyTypescriptConfig,
    },
  };
}

async function writeNarrowDirectorySource(productDir: string): Promise<string> {
  const narrowDirectory = join(
    VALIDATION_PIPELINE_DATA.sourceDirectoryName,
    VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
  );
  await mkdir(join(productDir, narrowDirectory), { recursive: true });
  await writeFile(
    join(productDir, narrowDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
    "export {};\n",
  );
  return narrowDirectory;
}

async function writeTypeScriptConfig(productDir: string, include: readonly string[]): Promise<void> {
  await writeFile(
    join(productDir, TSCONFIG_FILES.full),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true,
      },
      include,
    }),
  );
}

async function validateCircularScopeWithRecording(scopeConfig: ScopeConfig): Promise<{
  readonly dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[];
  readonly result: Awaited<ReturnType<typeof validateCircularDependencies>>;
}> {
  const recording = createRecordingDeps();
  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    scopeConfig,
    productDir,
    recording.deps,
  );
  return { dependencyGraphCalls: recording.dependencyGraphCalls, result };
}

function createReporterOutputDeps(reporterOutput: unknown): CircularDeps {
  return {
    [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (): Promise<IReporterOutput> => ({
      exitCode: 0,
      output: reporterOutput as string | ICruiseResult,
    }),
    [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: () => emptyTypescriptConfig,
  };
}

async function writeProductionTsConfigWithTestScope(path: string): Promise<void> {
  const testsDir = join(path, VALIDATION_PIPELINE_DATA.testDirectoryName);
  await mkdir(testsDir, { recursive: true });
  await writeFile(
    join(path, TSCONFIG_FILES.full),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: [
        VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
        VALIDATION_PIPELINE_DATA.testScopeFilePattern,
      ],
    }),
  );
  await writeFile(
    join(path, TSCONFIG_FILES.production),
    JSON.stringify({
      extends: `./${TSCONFIG_FILES.full}`,
      include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
    }),
  );
}

function createRecordingCircularCommandDeps(): {
  readonly deps: CircularCommandDeps;
  readonly validationCalls: ScopeConfig[];
} {
  const validationCalls: ScopeConfig[] = [];
  return {
    deps: {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    },
    validationCalls,
  };
}

async function expectCircularCommandScopes(
  productDir: string,
  files: readonly string[],
  expectedScopes: readonly ScopeConfig[],
): Promise<void> {
  const { deps, validationCalls } = createRecordingCircularCommandDeps();

  const result = await circularCommand(
    {
      cwd: productDir,
      files: [...files],
    },
    deps,
  );

  expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
  expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
  expect(validationCalls).toEqual(expectedScopes);
}

async function writeTestOnlyCycle(path: string): Promise<string> {
  const testsDir = join(path, VALIDATION_PIPELINE_DATA.testDirectoryName);
  const [cycleAPath, cycleBPath] = sampleDistinctTestFilePaths(2);
  await mkdir(testsDir, { recursive: true });
  await writeCycleModules(path, cycleAPath, cycleBPath);
  return cycleAPath;
}

async function writeCycleModules(
  rootDir: string,
  cycleAPath: string,
  cycleBPath: string,
): Promise<void> {
  await writeFile(
    join(rootDir, cycleAPath),
    `import { cycleB } from "${
      moduleSpecifierForCycleFile(cycleBPath)
    }";\n\nexport function cycleA(): string {\n  return cycleB();\n}\n`,
  );
  await writeFile(
    join(rootDir, cycleBPath),
    `import { cycleA } from "${
      moduleSpecifierForCycleFile(cycleAPath)
    }";\n\nexport function cycleB(): string {\n  return cycleA();\n}\n`,
  );
}

function moduleSpecifierForCycleFile(fileName: string): string {
  return `./${basename(fileName, ".ts")}`;
}

function expectedTypescriptSourcePatterns(directory: string): string[] {
  return DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES.map((suffix) => join(directory, suffix));
}

export async function runCircularDepsScenarioL1Case001(): Promise<void> {
  const dependency = createCircularDependency([
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
  ]);
  const { dependencyGraphCalls, deps } = createRecordingDeps(createCruiseResult(dependency));

  await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    deps,
  );

  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths, config, resolveOptions, transpileOptions] = dependencyGraphCalls[0] ?? [];
  const javascriptExtension = extname(validationCliPackagedExecutablePath());
  const javascriptSourceModule = sourceModule.replace(extname(sourceModule), javascriptExtension);
  expect(paths.some((pattern) => matchesGlob(sourceModule, pattern))).toBe(true);
  expect(paths.every((pattern) => !matchesGlob(javascriptSourceModule, pattern))).toBe(true);
  expect(config?.baseDir).toBe(productDir);
  expect(config?.exclude).toEqual({ path: [DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN] });
  const includeOnly = config?.includeOnly;
  const includeOnlyPath = typeof includeOnly === "object" && !Array.isArray(includeOnly)
    ? includeOnly.path
    : undefined;
  expect(typeof includeOnlyPath).toBe("string");
  if (typeof includeOnlyPath !== "string") return;
  expect(new RegExp(includeOnlyPath).test(sourceModule)).toBe(true);
  expect(new RegExp(includeOnlyPath).test(javascriptSourceModule)).toBe(false);
  expect(config?.enhancedResolveOptions?.extensions).toContain(extname(sourceModule));
  expect(config?.enhancedResolveOptions?.extensions).not.toContain(javascriptExtension);
  expect(config?.tsConfig?.fileName).toBe(join(productDir, TSCONFIG_FILES.full));
  expect(resolveOptions).toBeUndefined();
  expect(transpileOptions?.tsConfig).toBe(emptyTypescriptConfig);
}

export async function runCircularDepsScenarioL1Case002(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [],
    filePatterns: [sourceModule],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([sourceModule]);
}

export async function runCircularDepsScenarioL1Case003(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [],
    filePatterns: [nonTypeScriptSourceFile],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toEqual([]);
}

export async function runCircularDepsScenarioL1Case004(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
    ],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual(expectedTypescriptSourcePatterns(VALIDATION_PIPELINE_DATA.sourceDirectoryName));
}

export async function runCircularDepsScenarioL1Case005(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [analyzeDirectory],
    filePatterns: [rootTypeScriptFilePattern],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([...expectedTypescriptSourcePatterns(analyzeDirectory), rootTypeScriptFilePattern]);
}

export async function runCircularDepsScenarioL1Case006(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual(expectedTypescriptSourcePatterns(VALIDATION_PIPELINE_DATA.sourceDirectoryName));
}

export async function runCircularDepsScenarioL1Case007(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern]);
}

export async function runCircularDepsScenarioL1Case008(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
}

export async function runCircularDepsScenarioL1Case009(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern]);
}

export async function runCircularDepsScenarioL1Case010(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [
      join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
    ],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual(expectedTypescriptSourcePatterns(VALIDATION_PIPELINE_DATA.sourceDirectoryName));
}

export async function runCircularDepsScenarioL1Case011(): Promise<void> {
  const retainedDirectory = join(
    VALIDATION_PIPELINE_DATA.sourceDirectoryName,
    VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
  );
  const retainedLiteralFile = join(retainedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [retainedDirectory],
    filePatterns: [retainedLiteralFile],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual(expectedTypescriptSourcePatterns(retainedDirectory));
}

export async function runCircularDepsScenarioL1Case012(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [
      VALIDATION_PIPELINE_DATA.recursiveNamedSourceFilePattern,
      VALIDATION_PIPELINE_DATA.singleLevelNamedSourceFilePattern,
    ],
    excludePatterns: [],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [paths] = dependencyGraphCalls[0] ?? [];
  expect(paths).toEqual([
    VALIDATION_PIPELINE_DATA.recursiveNamedSourceFilePattern,
    VALIDATION_PIPELINE_DATA.singleLevelNamedSourceFilePattern,
  ]);
}

export async function runCircularDepsScenarioL1Case013(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [analyzeDirectory],
    filePatterns: [],
    excludePatterns: [VALIDATION_PIPELINE_DATA.testFileExcludePattern],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [, config] = dependencyGraphCalls[0] ?? [];
  expect(config?.exclude).toEqual({
    path: [
      DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
      String.raw`(^|/)(?:.*/|)[^/]*\.test\.ts$`,
    ],
  });
}

export async function runCircularDepsScenarioL1Case014(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [analyzeDirectory],
    filePatterns: [],
    excludePatterns: [VALIDATION_PIPELINE_DATA.prefixedDependencyExcludePattern],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [, config] = dependencyGraphCalls[0] ?? [];
  const expectedExcludePattern = "(^|/)dist(/.*|$)";
  expect(config?.exclude).toEqual({
    path: [
      DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
      expectedExcludePattern,
    ],
  });
  expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.prefixedDependencyExcludedFile)).toBe(
    true,
  );
  expect(new RegExp(expectedExcludePattern).test(`./${VALIDATION_PIPELINE_DATA.prefixedDependencyExcludedFile}`))
    .toBe(
      true,
    );
}

export async function runCircularDepsScenarioL1Case015(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [],
    excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [, config] = dependencyGraphCalls[0] ?? [];
  const expectedExcludePattern = [
    DEPENDENCY_CRUISER_PATH_PREFIX_PATTERN,
    VALIDATION_PIPELINE_DATA.markdownOnlyDirectoryName,
    DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN,
  ].join("");
  expect(config?.exclude).toEqual({
    path: [
      DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
      expectedExcludePattern,
    ],
  });
  expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.markdownOnlyFilePattern)).toBe(true);
  expect(
    new RegExp(expectedExcludePattern).test(
      join(
        VALIDATION_PIPELINE_DATA.sourceDirectoryName,
        `${VALIDATION_PIPELINE_DATA.markdownOnlyDirectoryName}.ts`,
      ),
    ),
  ).toBe(false);
}

export async function runCircularDepsScenarioL1Case016(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [],
    excludePatterns: [VALIDATION_PIPELINE_DATA.recursiveDependencyExcludePattern],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [, config] = dependencyGraphCalls[0] ?? [];
  const expectedExcludePattern = "(^|/)src(/.*/|/)generated(/.*|$)";
  expect(config?.exclude).toEqual({
    path: [
      DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
      expectedExcludePattern,
    ],
  });
  expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.recursiveDependencyRootExcludedFile))
    .toBe(
      true,
    );
  expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.recursiveDependencyNestedExcludedFile))
    .toBe(
      true,
    );
  expect(new RegExp(expectedExcludePattern).test(
    `./${VALIDATION_PIPELINE_DATA.recursiveDependencyNestedExcludedFile}`,
  )).toBe(true);
}

export async function runCircularDepsScenarioL1Case017(): Promise<void> {
  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createReporterOutputDeps(sampleLiteralTestValue(arbitraryDomainLiteral())),
  );

  expect(result).toEqual({
    success: false,
    error: DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
  });
}

export async function runCircularDepsScenarioL1Case018(): Promise<void> {
  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createReporterOutputDeps(null),
  );

  expect(result).toEqual({
    success: false,
    error: DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
  });
}

export async function runCircularDepsScenarioL1Case019(): Promise<void> {
  const dependency = createCircularDependencyWithCycle(
    [
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
    ],
    [
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_IMPORT,
    ],
  );

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expect(result).toEqual({ success: true });
}

export async function runCircularDepsScenarioL1Case020(): Promise<void> {
  const mixedValueTypeOnlyLabels = [
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_ONLY,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
  ];
  const dependency = createCircularDependencyWithCycle(
    mixedValueTypeOnlyLabels,
    mixedValueTypeOnlyLabels,
  );

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expectRuntimeCycle(result);
}

export async function runCircularDepsScenarioL1Case021(): Promise<void> {
  const mixedValueTypeImportLabels = [
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_IMPORT,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
  ];
  const dependency = createCircularDependencyWithCycle(
    mixedValueTypeImportLabels,
    mixedValueTypeImportLabels,
  );

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expectRuntimeCycle(result);
}

export async function runCircularDepsScenarioL1Case022(): Promise<void> {
  const dependency = createCircularDependency([
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
  ]);

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expectRuntimeCycle(result);
}

export async function runCircularDepsScenarioL1Case023(): Promise<void> {
  const dependency = createCircularDependency([
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_ONLY,
  ]);
  dependency.typeOnly = true;

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expect(result).toEqual({ success: true });
}

export async function runCircularDepsScenarioL1Case024(): Promise<void> {
  const dependency = createCircularDependencyWithCycle(
    [
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
    ],
    [
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
    ],
  );

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expect(result).toEqual({ success: true });
}

export async function runCircularDepsScenarioL1Case025(): Promise<void> {
  const dependency = createCircularDependency([
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
    DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY,
  ]);
  dependency.preCompilationOnly = true;
  dependency.cycle = [
    {
      name: targetModule,
      dependencyTypes: [
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY,
      ],
    },
    {
      name: sourceModule,
      dependencyTypes: [
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
        DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY,
      ],
    },
  ];

  const result = await validateCircularDependencies(
    VALIDATION_SCOPES.FULL,
    typescriptScope,
    productDir,
    createDeps(createCruiseResult(dependency)),
  );

  expect(result).toEqual({ success: true });
}

export async function runCircularDepsScenarioL1Case026(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await circularCommand({ cwd: path });

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
}

export async function runCircularDepsScenarioL1Case027(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ONLY_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await circularCommand({ cwd: path });

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.output).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
}

export async function runCircularDepsScenarioL1Case028(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const generatedDir = join(
      path,
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.recursiveDependencyRootDirectoryName,
    );
    await mkdir(generatedDir, { recursive: true });
    const [cycleAPath, cycleBPath] = sampleDistinctSourceFilePaths(2);
    await writeCycleModules(
      generatedDir,
      basename(cycleAPath),
      basename(cycleBPath),
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        exclude: [VALIDATION_PIPELINE_DATA.recursiveDependencyExcludePattern],
      }),
    );

    const result = await circularCommand({ cwd: path });

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.output).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
}

export async function runCircularDepsScenarioL1Case029(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand({ cwd: path }, deps);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case030(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand({ cwd: path }, deps);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case031(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const validationCalls: Array<{
      readonly scope: string;
      readonly typescriptScope: ScopeConfig;
      readonly productDir: string;
    }> = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (
        scope,
        scopeConfig,
        productDir,
      ) => {
        validationCalls.push({ scope, typescriptScope: scopeConfig, productDir });
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName)],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(validationCalls).toEqual([
      {
        scope: VALIDATION_SCOPES.FULL,
        typescriptScope: {
          directories: [],
          filePatterns: [
            join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
          ],
          excludePatterns: [],
        },
        productDir: path,
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case032(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [outOfRootRelativeSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case033(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await expectCircularCommandScopes(
      path,
      [`${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/`],
      [
        {
          directories: [],
          filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case034(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const apiDirectory = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
    );
    await mkdir(join(path, apiDirectory), { recursive: true });
    await writeFile(
      join(path, apiDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const api = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
      }),
    );
    await writeFile(
      join(path, CONFIG_FILENAMES.yaml),
      [
        "validation:",
        "  paths:",
        "    circular:",
        "      include:",
        `        - ${VALIDATION_PIPELINE_DATA.sourceDirectoryName}`,
        "",
      ].join("\n"),
    );

    await expectCircularCommandScopes(
      path,
      [`${apiDirectory}/`],
      [
        {
          directories: [apiDirectory],
          filePatterns: [`${apiDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case035(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await expectCircularCommandScopes(
      path,
      [
        `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/`,
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      ],
      [
        {
          directories: [],
          filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case036(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const wildcardBackedDirectory = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
    );
    await mkdir(join(path, wildcardBackedDirectory), { recursive: true });
    await writeFile(
      join(path, wildcardBackedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const wildcardBackedFile = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.singleLevelNamedSourceFilePattern],
      }),
    );

    await expectCircularCommandScopes(
      path,
      [`${wildcardBackedDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [join(wildcardBackedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName)],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case037(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const singleCharacterBackedDirectory = join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, "a");
    await mkdir(join(path, singleCharacterBackedDirectory), { recursive: true });
    await writeFile(
      join(path, singleCharacterBackedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const singleCharacterBackedFile = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.singleCharacterSourceIncludePattern],
      }),
    );

    await expectCircularCommandScopes(
      path,
      [`${singleCharacterBackedDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [join(singleCharacterBackedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName)],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case038(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await mkdir(join(path, analyzeDirectory), { recursive: true });
    await writeFile(join(path, sourceModule), "export const narrowFile = true;\n");
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [analyzeDirectory, sourceModule],
      }),
    );

    await expectCircularCommandScopes(
      path,
      [`${analyzeDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [`${analyzeDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case039(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const narrowDirectory = await writeNarrowDirectorySource(path);
    await writeTypeScriptConfig(path, [VALIDATION_PIPELINE_DATA.sourceDirectoryName]);

    await expectCircularCommandScopes(
      path,
      [`${narrowDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [`${narrowDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case040(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const narrowDirectory = await writeNarrowDirectorySource(path);
    await writeTypeScriptConfig(path, [VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern]);

    await expectCircularCommandScopes(
      path,
      [`${narrowDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case041(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const narrowDirectory = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
    );
    const explicitSourceFile = join(narrowDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
    await mkdir(join(path, narrowDirectory), { recursive: true });
    await writeFile(join(path, explicitSourceFile), "export const explicitFile = true;\n");
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.narrowSingleLevelTypeScriptSourceFilePattern],
      }),
    );

    await expectCircularCommandScopes(
      path,
      [`${narrowDirectory}/`, explicitSourceFile],
      [
        {
          directories: [],
          filePatterns: [VALIDATION_PIPELINE_DATA.narrowSingleLevelTypeScriptSourceFilePattern],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case042(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const narrowDirectory = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
    );
    const deeperFeatureDirectory = join(
      narrowDirectory,
      VALIDATION_PIPELINE_DATA.deepSourceDirectoryName,
      VALIDATION_PIPELINE_DATA.nestedFeatureSourceDirectoryName,
    );
    await mkdir(
      join(path, deeperFeatureDirectory),
      { recursive: true },
    );
    await writeFile(
      join(
        path,
        deeperFeatureDirectory,
        VALIDATION_PIPELINE_DATA.cleanSourceFileName,
      ),
      "export const nestedFeatureFile = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.nestedFeatureSourceFilePattern],
      }),
    );

    await expectCircularCommandScopes(
      path,
      [`${narrowDirectory}/`],
      [
        {
          directories: [],
          filePatterns: [VALIDATION_PIPELINE_DATA.narrowNestedFeatureSourceFilePattern],
          excludePatterns: [],
        },
      ],
    );
  });
}

export async function runCircularDepsScenarioL1Case043(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await mkdir(join(path, VALIDATION_PIPELINE_DATA.markdownOnlyDirectoryName), { recursive: true });
    await writeFile(
      join(
        path,
        VALIDATION_PIPELINE_DATA.markdownOnlyDirectoryName,
        VALIDATION_PIPELINE_DATA.markdownOnlyFileName,
      ),
      "markdown only\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern],
      }),
    );
    const result = await circularCommand({
      cwd: path,
      files: [`${VALIDATION_PIPELINE_DATA.markdownOnlyDirectoryName}/`],
    });

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
  });
}

export async function runCircularDepsScenarioL1Case044(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(
      join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.markdownOnlyFileName),
      "markdown only\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern],
      }),
    );

    const result = await circularCommand({
      cwd: path,
      files: ["."],
    });

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
  });
}

export async function runCircularDepsScenarioL1Case045(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const singleCharacterDirectory = join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, "a");
    const nestedSingleCharacterDirectory = join(
      singleCharacterDirectory,
      VALIDATION_PIPELINE_DATA.missingSourceDirectoryName,
    );
    await mkdir(join(path, nestedSingleCharacterDirectory), { recursive: true });
    await writeFile(
      join(path, nestedSingleCharacterDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const nestedSingleCharacterWildcard = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.singleCharacterSourceIncludePattern],
      }),
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [`${nestedSingleCharacterDirectory}/`],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case046(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: ["."],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(validationCalls).toEqual([
      {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case047(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await mkdir(join(path, dottedSourceDirectory), { recursive: true });
    await writeFile(join(path, dottedSourceDirectory, "index.ts"), "export const dottedDirectory = true;\n");
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [`${dottedSourceDirectory}/`],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(validationCalls).toEqual([
      {
        directories: [],
        filePatterns: [`${dottedSourceDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case048(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const modernTypeScriptDirectory = modernTypeScriptSourceFile;
    await mkdir(join(path, modernTypeScriptDirectory), { recursive: true });
    await writeFile(
      join(path, modernTypeScriptDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const modernDirectory = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [modernTypeScriptDirectory],
      }),
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [`${modernTypeScriptDirectory}/`],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(validationCalls).toEqual([
      {
        directories: [],
        filePatterns: [`${modernTypeScriptDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case049(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        exclude: [VALIDATION_PIPELINE_DATA.testFileExcludePattern],
      }),
    );
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName)],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(validationCalls).toEqual([
      {
        directories: [],
        filePatterns: [
          join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        ],
        excludePatterns: [VALIDATION_PIPELINE_DATA.testFileExcludePattern],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case050(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const generatedDirectory = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.recursiveDependencyRootDirectoryName,
    );
    await mkdir(join(path, generatedDirectory), { recursive: true });
    await writeFile(
      join(path, generatedDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const generated = true;\n",
    );
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        exclude: [VALIDATION_PIPELINE_DATA.recursiveDependencyExcludePattern],
      }),
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [`${generatedDirectory}/`],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case051(): Promise<void> {
  const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
    directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
    filePatterns: [],
    excludePatterns: [VALIDATION_PIPELINE_DATA.singleCharacterSourceExcludePattern],
  });

  expect(result.success).toBe(true);
  expect(dependencyGraphCalls).toHaveLength(1);
  const [, config] = dependencyGraphCalls[0] ?? [];
  expect(config?.exclude).toEqual({
    path: [
      DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
      String.raw`(^|/)src/[^/]/ignored\.ts$`,
    ],
  });
}

export function runCircularDepsScenarioL1Case052(): void {
  expect(
    typeScriptScopePatternIntersectsDirectory(
      VALIDATION_PIPELINE_DATA.recursiveGlobStressPattern,
      VALIDATION_PIPELINE_DATA.recursiveGlobStressDirectory,
    ),
  ).toBe(true);
}

export async function runCircularDepsScenarioL1Case053(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(join(path, modernTypeScriptSourceFile), "export const modernModule = true;\n");
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [modernTypeScriptSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(validationCalls).toEqual([
      {
        directories: [],
        filePatterns: [modernTypeScriptSourceFile],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case054(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const cleanSourceFile = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.cleanSourceFileName,
    );
    await writeFile(join(path, cleanSourceFile), "export const cleanSource = true;\n");
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern],
      }),
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [cleanSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case055(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeProductionTsConfigWithTestScope(path);
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        scope: VALIDATION_SCOPES.PRODUCTION,
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(validationCalls).toEqual([
      {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case056(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeProductionTsConfigWithTestScope(path);
    await writeTestOnlyCycle(path);

    const result = await circularCommand({
      cwd: path,
      scope: VALIDATION_SCOPES.PRODUCTION,
    });

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.output).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
}

export async function runCircularDepsScenarioL1Case057(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeProductionTsConfigWithTestScope(path);
    const testOnlyCyclePath = await writeTestOnlyCycle(path);
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        scope: VALIDATION_SCOPES.PRODUCTION,
        files: [testOnlyCyclePath],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case058(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const missingSourceFile = join(
      VALIDATION_PIPELINE_DATA.missingSourceDirectoryName,
      VALIDATION_PIPELINE_DATA.cleanSourceFileName,
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [missingSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case059(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(
      join(path, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
      "export const rootScopedAway = true;\n",
    );
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [dotSegmentedRootSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case060(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(join(path, nonTypeScriptSourceFile), "documentation fixture\n");
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [nonTypeScriptSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case061(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(join(path, extensionlessSourceFile), "documentation fixture\n");
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [extensionlessSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case062(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(join(path, declarationSourceFile), "export interface DeclarationOnly {}\n");
    const { deps, validationCalls } = createRecordingCircularCommandDeps();

    const result = await circularCommand(
      {
        cwd: path,
        files: [declarationSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case063(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [outOfRootRelativeSourceFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case064(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    await writeFile(join(path, dotPrefixedRootTypeScriptFile), "export const dotPrefixed = true;\n");
    await writeFile(
      join(path, TSCONFIG_FILES.full),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "commonjs",
          strict: true,
        },
        include: [dotPrefixedRootTypeScriptFile],
      }),
    );
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [dotPrefixedRootTypeScriptFile],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(validationCalls).toEqual([
      {
        directories: [],
        filePatterns: [dotPrefixedRootTypeScriptFile],
        excludePatterns: [],
      },
    ]);
  });
}

export async function runCircularDepsScenarioL1Case065(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const validationCalls: ScopeConfig[] = [];
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async (_scope, scopeConfig) => {
        validationCalls.push(scopeConfig);
        return { success: true };
      },
    };

    const result = await circularCommand(
      {
        cwd: path,
        files: [`${missingSourceDirectory}/`],
      },
      deps,
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toBe(formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    expect(validationCalls).toEqual([]);
  });
}

export async function runCircularDepsScenarioL1Case066(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const deps: CircularCommandDeps = {
      validateCircularDependencies: async () => ({
        success: false,
        error: validationCliDefinition.subcommands.circular.commandName,
        circularDependencies: [[sourceModule, targetModule, sourceModule]],
      }),
    };

    const result = await circularCommand({ cwd: path }, deps);

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    expect(result.output).toContain(sourceModule);
    expect(result.output).toContain(targetModule);
  });
}

async function expectPackagedCliRoutesCircularValidation(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.stdout).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stderr).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.circularOutput.DETAIL_A_TO_B);
  });
}

async function expectPackagedCliReportsCircularDependencies(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stderr).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.circularOutput.DETAIL_A_TO_B);
  });
}

export function registerCircularDepsScenarioL2Tests(): void {
  it(
    "packaged CLI routes validation circular to dependency-cruiser",
    { timeout: HARNESS_TIMEOUT },
    expectPackagedCliRoutesCircularValidation,
  );
  it(
    "packaged CLI reports real circular dependencies",
    { timeout: HARNESS_TIMEOUT },
    expectPackagedCliReportsCircularDependencies,
  );
}
