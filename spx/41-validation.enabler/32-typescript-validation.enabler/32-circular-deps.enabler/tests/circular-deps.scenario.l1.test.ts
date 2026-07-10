import { describe, expect, it } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path/posix";

import type { ICruiseResult, IDependency, IModule, IReporterOutput } from "dependency-cruiser";
import type { ParsedCommandLine } from "typescript";

import { circularCommand, type CircularCommandDeps } from "@/commands/validation/circular";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
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
  DEPENDENCY_CRUISER_MODULE_SYSTEMS,
  DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
  DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
  DEPENDENCY_CRUISER_PATH_PREFIX_PATTERN,
  DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN,
  DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS,
  DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN,
  validateCircularDependencies,
} from "@/validation/steps/circular";
import { type ScopeConfig, VALIDATION_SCOPES } from "@/validation/types";
import {
  arbitraryDomainLiteral,
  sampleDistinctSourceFilePaths,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const projectRoot = process.cwd();
const [sourceModule, targetModule] = sampleSourceModulePair();
const sourceModuleFileName = basename(sourceModule);
const targetModuleFileName = basename(targetModule);
const sourceModuleSpecifier = `./${basename(sourceModuleFileName, ".ts")}`;
const targetModuleSpecifier = `./${basename(targetModuleFileName, ".ts")}`;
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
  if (first === undefined || second === undefined) {
    throw new Error("Source path generator returned an incomplete pair");
  }
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
    projectRoot,
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
  const cycleAPath = join(VALIDATION_PIPELINE_DATA.testDirectoryName, sourceModuleFileName);
  await mkdir(testsDir, { recursive: true });
  await writeFile(
    join(path, cycleAPath),
    `import { cycleB } from "${targetModuleSpecifier}";\n\nexport function cycleA(): string {\n  return cycleB();\n}\n`,
  );
  await writeFile(
    join(path, VALIDATION_PIPELINE_DATA.testDirectoryName, targetModuleFileName),
    `import { cycleA } from "${sourceModuleSpecifier}";\n\nexport function cycleB(): string {\n  return cycleA();\n}\n`,
  );
  return cycleAPath;
}

function expectedTypescriptSourcePatterns(directory: string): string[] {
  return DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES.map((suffix) => join(directory, suffix));
}

describe("circular dependency filtering", () => {
  it("limits dependency-cruiser cruise inputs and resolution to TypeScript sources", async () => {
    const dependency = createCircularDependency([
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
    ]);
    const { dependencyGraphCalls, deps } = createRecordingDeps(createCruiseResult(dependency));

    await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      typescriptScope,
      projectRoot,
      deps,
    );

    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths, config, resolveOptions, transpileOptions] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual(expectedTypescriptSourcePatterns(analyzeDirectory));
    expect(config?.baseDir).toBe(projectRoot);
    expect(config?.exclude).toEqual({ path: [DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN] });
    expect(config?.includeOnly).toEqual({ path: DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN });
    expect(config?.moduleSystems).toEqual([...DEPENDENCY_CRUISER_MODULE_SYSTEMS]);
    expect(config?.enhancedResolveOptions?.extensions).toEqual([
      ...DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS,
    ]);
    expect(config?.tsConfig?.fileName).toBe(join(projectRoot, TSCONFIG_FILES.full));
    expect(config?.tsPreCompilationDeps).toBe(DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS);
    expect(resolveOptions).toBeUndefined();
    expect(transpileOptions?.tsConfig).toBe(emptyTypescriptConfig);
  });

  it("uses file patterns as dependency-cruiser inputs when the validation scope is explicit files", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [],
      filePatterns: [sourceModule],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([sourceModule]);
  });

  it("skips non-TypeScript fallback file patterns before invoking dependency-cruiser", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [],
      filePatterns: [nonTypeScriptSourceFile],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toEqual([]);
  });

  it("keeps directory inputs when narrower file patterns do not fully cover them", async () => {
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
  });

  it("keeps root-level TypeScript globs when dependency-cruiser inputs also include directories", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [analyzeDirectory],
      filePatterns: [rootTypeScriptFilePattern],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([...expectedTypescriptSourcePatterns(analyzeDirectory), rootTypeScriptFilePattern]);
  });

  it("keeps directory inputs when non-TypeScript globs are present", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
      filePatterns: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual(expectedTypescriptSourcePatterns(VALIDATION_PIPELINE_DATA.sourceDirectoryName));
  });

  it("keeps TypeScript-only include globs from widening to every TypeScript extension", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
      filePatterns: [VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern]);
  });

  it("keeps broad TypeScript include globs from expanding to every TypeScript extension", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
      filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
  });

  it("keeps nested TypeScript include globs instead of widening them to their top-level directory", async () => {
    const { dependencyGraphCalls, result } = await validateCircularScopeWithRecording({
      directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
      filePatterns: [VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern],
      excludePatterns: [],
    });

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern]);
  });

  it("keeps literal TypeScript file includes from widening to their top-level directory", async () => {
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
  });

  it("keeps retained directory targets when literal TypeScript files also match", async () => {
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
  });

  it("keeps wildcard-narrowed TypeScript include globs instead of widening them to their top-level directory", async () => {
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
  });

  it("converts glob exclude patterns before passing them to dependency-cruiser", async () => {
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
  });

  it("allows dependency-cruiser glob excludes to match prefixed module paths", async () => {
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
    expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.prefixedDependencyExcludedFile)).toBe(true);
    expect(new RegExp(expectedExcludePattern).test(`./${VALIDATION_PIPELINE_DATA.prefixedDependencyExcludedFile}`))
      .toBe(
        true,
      );
  });

  it("converts directory-subtree excludes to anchored dependency-cruiser patterns", async () => {
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
  });

  it("converts recursive dependency-cruiser glob excludes without unsafe regex shapes", async () => {
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
    expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.recursiveDependencyRootExcludedFile)).toBe(
      true,
    );
    expect(new RegExp(expectedExcludePattern).test(VALIDATION_PIPELINE_DATA.recursiveDependencyNestedExcludedFile))
      .toBe(
        true,
      );
    expect(new RegExp(expectedExcludePattern).test(
      `./${VALIDATION_PIPELINE_DATA.recursiveDependencyNestedExcludedFile}`,
    )).toBe(true);
  });

  it("fails clearly when dependency-cruiser returns non-structured reporter output", async () => {
    const result = await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      typescriptScope,
      projectRoot,
      createReporterOutputDeps(sampleLiteralTestValue(arbitraryDomainLiteral())),
    );

    expect(result).toEqual({
      success: false,
      error: DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
    });
  });

  it("fails clearly when dependency-cruiser returns null reporter output", async () => {
    const result = await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      typescriptScope,
      projectRoot,
      createReporterOutputDeps(null),
    );

    expect(result).toEqual({
      success: false,
      error: DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
    });
  });

  it("ignores a cycle when the initial dependency survives runtime but a cycle vertex is type-erased", async () => {
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
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expect(result).toEqual({ success: true });
  });

  it("reports a cycle when mixed value and type-only labels still include a runtime dependency", async () => {
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
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expectRuntimeCycle(result);
  });

  it("reports a cycle when mixed value and type-import labels still include a runtime dependency", async () => {
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
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expectRuntimeCycle(result);
  });

  it("reports a dependency-cruiser circular dependency without a cycle payload when the dependency survives runtime", async () => {
    const dependency = createCircularDependency([
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
    ]);

    const result = await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      typescriptScope,
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expectRuntimeCycle(result);
  });

  it("ignores a dependency-cruiser circular dependency without a cycle payload when the initial dependency is type-erased", async () => {
    const dependency = createCircularDependency([
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.LOCAL,
      DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_ONLY,
    ]);
    dependency.typeOnly = true;

    const result = await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      typescriptScope,
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expect(result).toEqual({ success: true });
  });

  it("ignores a pre-compilation-only cycle vertex even when it carries an import label", async () => {
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
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expect(result).toEqual({ success: true });
  });

  it("ignores a pure pre-compilation-only circular dependency", async () => {
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
      projectRoot,
      createDeps(createCruiseResult(dependency)),
    );

    expect(result).toEqual({ success: true });
  });
});

describe("circular command scope routing", () => {
  it("reports a real circular dependency from a TypeScript project", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
      const result = await circularCommand({ cwd: path });

      expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    });
  });

  it("reports no cycles for a project whose circular imports are type-only", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ONLY_CIRCULAR_DEPS }, async ({ path }) => {
      const result = await circularCommand({ cwd: path });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
      expect(result.output).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    });
  });

  it("honors recursive generated-file excludes accepted by dependency-cruiser", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
      const generatedDir = join(
        path,
        VALIDATION_PIPELINE_DATA.sourceDirectoryName,
        VALIDATION_PIPELINE_DATA.recursiveDependencyRootDirectoryName,
      );
      await mkdir(generatedDir, { recursive: true });
      await writeFile(
        join(generatedDir, sourceModuleFileName),
        `import { cycleB } from "${targetModuleSpecifier}";\n\nexport function cycleA(): string {\n  return cycleB();\n}\n`,
      );
      await writeFile(
        join(generatedDir, targetModuleFileName),
        `import { cycleA } from "${sourceModuleSpecifier}";\n\nexport function cycleB(): string {\n  return cycleA();\n}\n`,
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
  });

  it("skips circular validation without invoking dependency-cruiser when TypeScript is absent", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
      const { deps, validationCalls } = createRecordingCircularCommandDeps();

      const result = await circularCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips circular validation without invoking dependency-cruiser when tsconfig is absent", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
      const { deps, validationCalls } = createRecordingCircularCommandDeps();

      const result = await circularCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("forwards explicit path operands as project-relative dependency-cruiser inputs", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
      const validationCalls: Array<{
        readonly scope: string;
        readonly typescriptScope: ScopeConfig;
        readonly projectRoot: string;
      }> = [];
      const deps: CircularCommandDeps = {
        validateCircularDependencies: async (
          scope,
          scopeConfig,
          projectRoot,
        ) => {
          validationCalls.push({ scope, typescriptScope: scopeConfig, projectRoot });
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
          projectRoot: path,
        },
      ]);
    });
  });

  it("rejects out-of-project path operands before circular validation runs", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("forwards path operand directories as constrained TypeScript scope", async () => {
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
  });

  it("forwards path operand directories covered by config include when tsconfig uses default includes", async () => {
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
  });

  it("drops explicit file operands already covered by explicit directory operands", async () => {
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
  });

  it("forwards path operand directories that intersect wildcard-backed TypeScript includes", async () => {
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
  });

  it("forwards path operand directories that intersect single-character TypeScript includes", async () => {
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
  });

  it("constrains explicit directories when TypeScript includes also name narrower files", async () => {
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
  });

  it("constrains explicit subdirectories under literal TypeScript directory includes", async () => {
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
  });

  it("constrains TypeScript include globs to explicit directories", async () => {
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
  });

  it("drops explicit files covered by constrained directory globs", async () => {
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
  });

  it("preserves nested TypeScript include suffixes when constraining explicit directories", async () => {
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
  });

  it("skips explicit directories that intersect only non-TypeScript include globs", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    });
  });

  it("skips the project root when TypeScript config includes only non-TypeScript globs", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
    });
  });

  it("skips path operand directories below single-character wildcard TypeScript includes", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("forwards root path operand directories as the existing TypeScript scope", async () => {
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
  });

  it("forwards existing dotted path operand directories as constrained TypeScript scope", async () => {
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
  });

  it("forwards explicit directories with TypeScript-like suffixes as constrained TypeScript scope", async () => {
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
  });

  it("keeps explicit TypeScript files when glob-only excludes do not match them", async () => {
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
  });

  it("skips explicit directories covered by TypeScript exclude patterns", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("converts single-character wildcard exclude patterns before passing them to dependency-cruiser", async () => {
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
  });

  it("resolves repeated recursive glob directory matching with bounded work", () => {
    expect(
      typeScriptScopePatternIntersectsDirectory(
        VALIDATION_PIPELINE_DATA.recursiveGlobStressPattern,
        VALIDATION_PIPELINE_DATA.recursiveGlobStressDirectory,
      ),
    ).toBe(true);
  });

  it("forwards explicit modern TypeScript module files as dependency-cruiser file scope", async () => {
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
  });

  it("skips explicit TypeScript files outside resolved TypeScript config scope", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("passes production TypeScript scope to dependency-cruiser", async () => {
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
  });

  it("ignores real circular dependencies outside production TypeScript scope", async () => {
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
  });

  it("skips explicit files outside the requested TypeScript scope", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips missing explicit TypeScript files instead of invoking dependency-cruiser", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("canonicalizes dot-segment explicit files before TypeScript scope checks", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips explicit non-TypeScript files inside the TypeScript scope", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips existing extensionless files inside the TypeScript scope", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips declaration files inside the TypeScript scope", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips explicit relative paths that escape the project root", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("keeps explicit root files whose names start with dot segments", async () => {
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
  });

  it("skips missing explicit directories instead of trusting trailing slashes", async () => {
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
      expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("maps circular dependencies reported by the validation step to CLI output", async () => {
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
  });
});
