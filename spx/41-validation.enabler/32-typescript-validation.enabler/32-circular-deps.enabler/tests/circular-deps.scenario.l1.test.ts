import { describe, expect, it } from "vitest";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path/posix";

import type { ICruiseResult, IDependency, IModule, IReporterOutput } from "dependency-cruiser";
import type { ParsedCommandLine } from "typescript";

import {
  circularCommand,
  type CircularCommandDeps,
} from "@/commands/validation/circular";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { validationCliDefinition } from "@/interfaces/cli/validation";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import {
  CIRCULAR_DEPS_KEYS,
  type CircularDeps,
  type CircularDependencyGraphRunner,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES,
  DEPENDENCY_CRUISER_MODULE_SYSTEMS,
  DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR,
  DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
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
const analyzeDirectory = dirname(sourceModule);
const nonTypeScriptSourceFile = join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, "readme.md");
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

function createReporterOutputDeps(reporterOutput: string): CircularDeps {
  return {
    [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (): Promise<IReporterOutput> => ({
      exitCode: 0,
      output: reporterOutput,
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

async function writeTestOnlyCycle(path: string): Promise<string> {
  const testsDir = join(path, VALIDATION_PIPELINE_DATA.testDirectoryName);
  const cycleAPath = join(VALIDATION_PIPELINE_DATA.testDirectoryName, "cycle-a.ts");
  await mkdir(testsDir, { recursive: true });
  await writeFile(
    join(path, cycleAPath),
    `import { cycleB } from "./cycle-b";\n\nexport function cycleA(): string {\n  return cycleB();\n}\n`,
  );
  await writeFile(
    join(path, VALIDATION_PIPELINE_DATA.testDirectoryName, "cycle-b.ts"),
    `import { cycleA } from "./cycle-a";\n\nexport function cycleB(): string {\n  return cycleA();\n}\n`,
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
    const dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[] = [];
    const deps: CircularDeps = {
      [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (...call): Promise<IReporterOutput> => {
        dependencyGraphCalls.push(call);
        return {
          exitCode: 0,
          output: createCruiseResult(dependency),
        };
      },
      [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: () => emptyTypescriptConfig,
    };

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
    const dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[] = [];
    const deps: CircularDeps = {
      [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (...call): Promise<IReporterOutput> => {
        dependencyGraphCalls.push(call);
        return {
          exitCode: 0,
          output: createEmptyCruiseResult(),
        };
      },
      [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: () => emptyTypescriptConfig,
    };

    const result = await validateCircularDependencies(
      VALIDATION_SCOPES.FULL,
      {
        directories: [],
        filePatterns: [sourceModule],
        excludePatterns: [],
      },
      projectRoot,
      deps,
    );

    expect(result.success).toBe(true);
    expect(dependencyGraphCalls).toHaveLength(1);
    const [paths] = dependencyGraphCalls[0] ?? [];
    expect(paths).toEqual([sourceModule]);
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

  it("skips circular validation without invoking dependency-cruiser when TypeScript is absent", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
      const validationCalls: ScopeConfig[] = [];
      const deps: CircularCommandDeps = {
        validateCircularDependencies: async (_scope, scopeConfig) => {
          validationCalls.push(scopeConfig);
          return { success: true };
        },
      };

      const result = await circularCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("skips circular validation without invoking dependency-cruiser when tsconfig is absent", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
      const validationCalls: ScopeConfig[] = [];
      const deps: CircularCommandDeps = {
        validateCircularDependencies: async (_scope, scopeConfig) => {
          validationCalls.push(scopeConfig);
          return { success: true };
        },
      };

      const result = await circularCommand({ cwd: path }, deps);

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR));
      expect(validationCalls).toEqual([]);
    });
  });

  it("forwards --files as project-relative dependency-cruiser inputs", async () => {
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
            filePatterns: [join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName)],
            excludePatterns: [],
          },
          projectRoot: path,
        },
      ]);
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
