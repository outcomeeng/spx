import { describe, expect, it } from "vitest";

import { dirname } from "node:path/posix";

import type { ICruiseResult, IDependency, IModule, IReporterOutput } from "dependency-cruiser";
import type { ParsedCommandLine } from "typescript";

import {
  CIRCULAR_DEPS_KEYS,
  type CircularDeps,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES,
  validateCircularDependencies,
} from "@/validation/steps/circular";
import { type ScopeConfig, VALIDATION_SCOPES } from "@/validation/types";
import { sampleDistinctSourceFilePaths } from "@testing/generators/literal/literal";

const projectRoot = process.cwd();
const [sourceModule, targetModule] = sampleSourceModulePair();
const analyzeDirectory = dirname(sourceModule);
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

describe("circular dependency filtering", () => {
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
