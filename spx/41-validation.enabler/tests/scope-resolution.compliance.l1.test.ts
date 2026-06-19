import type { ChildProcess, SpawnOptions } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { TYPESCRIPT_VALIDATION_MESSAGES, typescriptCommand } from "@/commands/validation/typescript";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { VALIDATION_PATHS_SUBSECTION, validationConfigDescriptor } from "@/validation/config/descriptor";
import {
  defaultScopeDeps,
  getTypeScriptScope,
  pathPassesTypeScriptScope,
  TSCONFIG_FILES,
  TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS,
  TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX,
  typeScriptScopePatternTargetsTypeScriptSource,
} from "@/validation/config/scope";
import {
  CIRCULAR_DEPS_KEYS,
  type CircularDependencyGraphRunner,
  type CircularDeps,
  defaultCircularDeps,
  DEPENDENCY_CRUISER_MODULE_SYSTEMS,
  DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
  DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS,
  DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN,
  validateCircularDependencies,
} from "@/validation/steps/circular";
import { KNIP_COMMAND_TOKENS, type KnipDeps, validateKnip } from "@/validation/steps/knip";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import {
  defaultTypeScriptDeps,
  TEMPORARY_TSCONFIG_PARENT_SEGMENTS,
  type TypeScriptDeps,
  validateTypeScript,
} from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { RecordingSpawnOptionsRunner, RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

function createRootRecordingDeps(projectRoot: string, checkedPaths: string[]): TypeScriptDeps {
  return {
    ...defaultTypeScriptDeps,
    existsSync(path) {
      const checkedPath = path.toString();
      checkedPaths.push(checkedPath);
      return checkedPath.startsWith(projectRoot);
    },
  };
}

function createDependencyGraphResult(): Awaited<ReturnType<CircularDependencyGraphRunner>> {
  return {
    output: {
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
    },
    exitCode: VALIDATION_EXIT_CODES.SUCCESS,
  };
}

function expectedDependencyCruiserSourcePatterns(directory: string): string[] {
  return DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES.map((suffix) => join(directory, suffix));
}

const narrowSourceDirectory = join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, "api");
const deepSourceDirectory = join(
  narrowSourceDirectory,
  VALIDATION_PIPELINE_DATA.deepSourceDirectoryName,
  VALIDATION_PIPELINE_DATA.nestedSourceDirectoryName,
);
const topLevelSourceFile = join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
const nestedSourceFile = join(narrowSourceDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
const deepSourceFile = join(deepSourceDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
const extensionlessNestedPath = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.extensionlessSourceFileName,
);

class ErrorThenCloseRunner implements ProcessRunner {
  readonly options: SpawnOptions[] = [];

  constructor(private readonly errorMessage: string) {}

  spawn(_command: string, _args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.options.push(options ?? {});
    const child = new RecordingValidationChild();
    queueMicrotask(() => {
      child.emit(VALIDATION_SUBPROCESS_EVENTS.ERROR, new Error(this.errorMessage));
      child.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, VALIDATION_EXIT_CODES.FAILURE);
    });
    return child.asChildProcess();
  }
}

describe("ALWAYS: TypeScript scope resolution uses the requested project root", () => {
  it("discovers TypeScript directories under the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile, "");

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.directories).toContain(VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName);
    });
  });

  it("resolves array-based TypeScript config extends without crashing", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(
        "base-includes.json",
        JSON.stringify({
          exclude: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        }),
      );
      await env.writeRaw(
        "base-excludes.json",
        JSON.stringify({ exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern] }),
      );
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({ extends: ["./base-includes.json", "./base-excludes.json"] }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.productDir);

      expect(scope.filePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
      expect(scope.excludePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeExcludePattern]);
    });
  });

  it("filters TypeScript include patterns whose target is absent or wholly excluded", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({
          include: [
            VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
            VALIDATION_PIPELINE_DATA.absentScopeFilePattern,
            VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
          ],
          exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.productDir);

      expect(scope.filePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
    });
  });

  it("ignores non-TypeScript include patterns when resolving TypeScript scope", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.markdownOnlyFileName),
        "",
      );
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern] }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.directories).toEqual([]);
      expect(scope.filePatterns).toEqual([]);
    });
  });

  it("classifies TypeScript source include patterns without widening extensionless files", () => {
    expect(typeScriptScopePatternTargetsTypeScriptSource(VALIDATION_PIPELINE_DATA.sourceDirectoryName)).toBe(false);
    expect(typeScriptScopePatternTargetsTypeScriptSource(VALIDATION_PIPELINE_DATA.productionScopeFilePattern)).toBe(true);
    expect(typeScriptScopePatternTargetsTypeScriptSource(VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern)).toBe(true);
    expect(typeScriptScopePatternTargetsTypeScriptSource(topLevelSourceFile)).toBe(true);
    expect(typeScriptScopePatternTargetsTypeScriptSource(extensionlessNestedPath)).toBe(false);
    expect(typeScriptScopePatternTargetsTypeScriptSource(`**/${VALIDATION_PIPELINE_DATA.extensionlessSourceFileName}`))
      .toBe(false);
    expect(typeScriptScopePatternTargetsTypeScriptSource(VALIDATION_PIPELINE_DATA.recursiveMarkdownSourceFilePattern))
      .toBe(false);
  });

  it("keeps literal nested directory includes scoped to their TypeScript subtree", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(nestedSourceFile, "");
      await env.writeRaw(topLevelSourceFile, "");
      await env.writeRaw(TSCONFIG_FILES.full, JSON.stringify({ include: [narrowSourceDirectory] }));

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.filePatterns).toEqual([`${narrowSourceDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`]);
      expect(pathPassesTypeScriptScope(nestedSourceFile, scope)).toBe(true);
      expect(pathPassesTypeScriptScope(topLevelSourceFile, scope)).toBe(false);
    });
  });

  it("keeps literal directory includes recursive without probing subtree depth", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(deepSourceFile, "");
      await env.writeRaw(TSCONFIG_FILES.full, JSON.stringify({ include: [narrowSourceDirectory] }));

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.filePatterns).toEqual([`${narrowSourceDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`]);
      expect(pathPassesTypeScriptScope(deepSourceFile, scope)).toBe(true);
    });
  });

  it("keeps literal directory includes whose final segment has a TypeScript suffix", async () => {
    await withTestEnv({}, async (env) => {
      const modernNamedDirectorySourceFile = join(
        VALIDATION_PIPELINE_DATA.modernSourceFileName,
        VALIDATION_PIPELINE_DATA.cleanSourceFileName,
      );
      await env.writeRaw(modernNamedDirectorySourceFile, "");
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.modernSourceFileName] }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.filePatterns).toEqual([
        `${VALIDATION_PIPELINE_DATA.modernSourceFileName}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`,
      ]);
      expect(pathPassesTypeScriptScope(modernNamedDirectorySourceFile, scope)).toBe(true);
    });
  });

  it("does not widen scope for dotless literal file includes", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(extensionlessNestedPath, "");
      await env.writeRaw(TSCONFIG_FILES.full, JSON.stringify({ include: [extensionlessNestedPath] }));

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.directories).toEqual([]);
      expect(scope.filePatterns).toEqual([]);
    });
  });

  it("uses fallback TypeScript config patterns that include modern module files", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.modernSourceFileName),
        "",
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir, {
        ...defaultScopeDeps,
        readFileSync: () => {
          throw new Error("unreadable fixture tsconfig");
        },
      });

      expect(scope.directories).toEqual([VALIDATION_PIPELINE_DATA.sourceDirectoryName]);
      expect(scope.filePatterns).toEqual([...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS]);
    });
  });

  it("does not discover directories outside explicit TypeScript include patterns", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(join(VALIDATION_PIPELINE_DATA.testDirectoryName, "cycle-a.ts"), "");
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.productDir);

      expect(scope.directories).toEqual([VALIDATION_PIPELINE_DATA.sourceDirectoryName]);
    });
  });

  it("keeps catch-all TypeScript include globs from narrowing top-level discovery", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.scriptSourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({
          include: [
            VALIDATION_PIPELINE_DATA.typeScriptOnlySourceFilePattern,
            ...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS,
          ],
        }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.productDir);

      expect(scope.directories).toEqual([
        VALIDATION_PIPELINE_DATA.scriptSourceDirectoryName,
        VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      ]);
    });
  });

  it("lets child TypeScript exclude replace inherited excludes", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
        "",
      );
      await env.writeRaw(
        "base-excludes.json",
        JSON.stringify({ exclude: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] }),
      );
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({
          extends: "./base-excludes.json",
          include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        }),
      );

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.productDir);

      expect(scope.filePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
      expect(scope.excludePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeExcludePattern]);
    });
  });

  it("runs TypeScript validation from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const checkedPaths: string[] = [];
      const deps = createRootRecordingDeps(env.productDir, checkedPaths);

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
        },
        { runner, deps },
      );

      expect(result.success).toBe(true);
      expect(checkedPaths.every((path) => path.startsWith(env.productDir))).toBe(true);
      expect(runner.commands.every((command) => command.startsWith(env.productDir))).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.productDir)).toBe(true);
    });
  });

  it("runs file-scoped TypeScript validation from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const checkedPaths: string[] = [];
      const deps = createRootRecordingDeps(env.productDir, checkedPaths);

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
          files: [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile],
        },
        { runner, deps },
      );

      expect(result.success).toBe(true);
      expect(checkedPaths.every((path) => path.startsWith(env.productDir))).toBe(true);
      expect(runner.commands.every((command) => command.startsWith(env.productDir))).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.productDir)).toBe(true);
    });
  });

  it("runs config-filtered TypeScript validation through a scoped temporary config", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const writtenConfigs: string[] = [];
      const deps: TypeScriptDeps = {
        ...defaultTypeScriptDeps,
        writeFileSync(path, data) {
          writtenConfigs.push(data.toString());
          defaultTypeScriptDeps.writeFileSync(path, data);
        },
      };

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
          scopeConfig: {
            directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
            excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            filteredByValidationPaths: true,
          },
        },
        { runner, deps },
      );

      expect(result.success).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.productDir)).toBe(true);
      expect(writtenConfigs).toHaveLength(1);
      const writtenConfig = JSON.parse(writtenConfigs[0] ?? "{}");
      expect(writtenConfig).toMatchObject({
        extends: join(env.productDir, TSCONFIG_FILES.full),
        include: [join(env.productDir, VALIDATION_PIPELINE_DATA.productionScopeFilePattern)],
        exclude: [join(env.productDir, VALIDATION_PIPELINE_DATA.productionScopeExcludePattern)],
      });
      expect(writtenConfig.compilerOptions).toEqual({ noEmit: true });
    });
  });

  it("skips config-filtered TypeScript validation when validation paths match no targets", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
          scopeConfig: {
            directories: [],
            filePatterns: [],
            excludePatterns: [],
            filteredByValidationPaths: true,
            filteredByValidationPathIncludes: true,
            filteredByValidationPathNoMatches: true,
          },
        },
        { runner, deps: defaultTypeScriptDeps },
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(runner.commands).toEqual([]);
    });
  });

  it("intersects file-scoped TypeScript validation with validation paths", async () => {
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({
            include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath],
          }),
        );
        await env.writeRaw(testFilePath, "expect(true).toBe(true);\n");

        const result = await typescriptCommand({ cwd: env.productDir, files: [testFilePath] });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(TYPESCRIPT_VALIDATION_MESSAGES.NO_VALIDATION_PATH_TARGETS);
      },
    );
  });

  it("does not expand TypeScript validation scope to include paths outside tsconfig scope", async () => {
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [testFilePath],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
        );
        await env.writeRaw(VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile, "");

        const result = await typescriptCommand({ cwd: env.productDir });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(TYPESCRIPT_VALIDATION_MESSAGES.NO_VALIDATION_PATH_TARGETS);
      },
    );
  });

  it("requires explicit files to match TypeScript include patterns when directories are broader", () => {
    const scope = {
      directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
      filePatterns: [VALIDATION_PIPELINE_DATA.narrowProductionScopeFilePattern],
      excludePatterns: [],
    };

    expect(pathPassesTypeScriptScope(nestedSourceFile, scope)).toBe(true);
    expect(pathPassesTypeScriptScope(topLevelSourceFile, scope)).toBe(false);
  });

  it("runs config-filtered Knip validation through a scoped temporary config", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const writtenConfigs: string[] = [];
      const deps: KnipDeps = {
        existsSync: () => false,
        mkdtemp: defaultTypeScriptDeps.mkdtemp,
        rm: async () => {},
        writeFile: async (_path, data) => {
          writtenConfigs.push(data.toString());
        },
      };

      const result = await validateKnip(
        {
          projectRoot: env.productDir,
          typescriptScope: {
            directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
            excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            filteredByValidationPaths: true,
          },
        },
        runner,
        deps,
      );

      expect(result.success).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.productDir)).toBe(true);
      expect(runner.args[0]?.slice(0, 3)).toEqual([
        KNIP_COMMAND_TOKENS.COMMAND,
        KNIP_COMMAND_TOKENS.USE_TSCONFIG_FILES_FLAG,
        KNIP_COMMAND_TOKENS.TSCONFIG_FLAG,
      ]);
      expect(writtenConfigs).toHaveLength(1);
      expect(JSON.parse(writtenConfigs[0] ?? "{}")).toEqual({
        extends: join(env.productDir, TSCONFIG_FILES.full),
        include: [join(env.productDir, VALIDATION_PIPELINE_DATA.productionScopeFilePattern)],
        exclude: [join(env.productDir, VALIDATION_PIPELINE_DATA.productionScopeExcludePattern)],
      });
    });
  });

  it("cleans config-filtered Knip temporary config once when error and close both fire", async () => {
    const errorMessage = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withTestEnv({}, async (env) => {
      const runner = new ErrorThenCloseRunner(errorMessage);
      const cleanupTargets: string[] = [];
      const deps: KnipDeps = {
        existsSync: () => false,
        mkdtemp: defaultTypeScriptDeps.mkdtemp,
        rm: async (path) => {
          cleanupTargets.push(path.toString());
        },
        writeFile: async () => {},
      };

      const result = await validateKnip(
        {
          projectRoot: env.productDir,
          typescriptScope: {
            directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
            excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            filteredByValidationPaths: true,
          },
        },
        runner,
        deps,
      );

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(cleanupTargets).toHaveLength(1);
      expect(runner.options.every((options) => options.cwd === env.productDir)).toBe(true);
    });
  });

  it("runs circular validation with project-root-anchored dependency-cruiser inputs", async () => {
    await withTestEnv({}, async (env) => {
      const tsconfigExcludePatternWithGlob = "dist+(cache)/**/*";
      const dependencyCruiserExcludePattern = String.raw`dist\+\(cache\)`;
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile] }),
      );
      await env.writeRaw(VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile, "");
      const dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[] = [];
      const extractedTypeScriptConfigFiles: string[] = [];
      const deps: CircularDeps = {
        [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: async (...call) => {
          dependencyGraphCalls.push(call);
          return createDependencyGraphResult();
        },
        [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: (tsConfigFile) => {
          extractedTypeScriptConfigFiles.push(tsConfigFile);
          return defaultCircularDeps[CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG](tsConfigFile);
        },
      };

      const result = await validateCircularDependencies(
        VALIDATION_SCOPES.FULL,
        {
          directories: [VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName],
          filePatterns: [],
          excludePatterns: [tsconfigExcludePatternWithGlob],
        },
        env.productDir,
        deps,
      );

      expect(result.success).toBe(true);
      expect(dependencyGraphCalls).toHaveLength(1);
      const [paths, config, resolveOptions, transpileOptions] = dependencyGraphCalls[0] ?? [];
      expect(paths).toEqual(
        expectedDependencyCruiserSourcePatterns(VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName),
      );
      expect(config?.baseDir).toBe(env.productDir);
      expect(config?.tsConfig?.fileName).toBe(join(env.productDir, TSCONFIG_FILES.full));
      expect(config?.tsPreCompilationDeps).toBe(DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS);
      expect(config?.moduleSystems).toEqual([...DEPENDENCY_CRUISER_MODULE_SYSTEMS]);
      expect(config?.includeOnly).toEqual({ path: DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN });
      const dependencyCruiserSourceMatcher = new RegExp(DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN, "u");
      expect(dependencyCruiserSourceMatcher.test(VALIDATION_PIPELINE_DATA.cleanSourceFileName)).toBe(true);
      expect(dependencyCruiserSourceMatcher.test(VALIDATION_PIPELINE_DATA.modernSourceFileName)).toBe(true);
      expect(dependencyCruiserSourceMatcher.test(VALIDATION_PIPELINE_DATA.declarationSourceFileName)).toBe(false);
      expect(config?.enhancedResolveOptions?.extensions).toEqual([
        ...DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS,
      ]);
      expect(config?.exclude).toEqual({
        path: [DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN, dependencyCruiserExcludePattern],
      });
      expect(resolveOptions).toBeUndefined();
      expect(transpileOptions?.tsConfig).toBeDefined();
      expect(extractedTypeScriptConfigFiles).toEqual([join(env.productDir, TSCONFIG_FILES.full)]);
    });
  });
});

describe("ALWAYS: the temporary tsconfig reproduces the project's TypeScript resolution", () => {
  it("writes the scope-filtered temporary config inside the project's node_modules and fabricates no compiler options", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const writtenConfigPaths: string[] = [];
      const writtenConfigs: string[] = [];
      const deps: TypeScriptDeps = {
        ...defaultTypeScriptDeps,
        writeFileSync(path, data) {
          writtenConfigPaths.push(path.toString());
          writtenConfigs.push(data.toString());
          defaultTypeScriptDeps.writeFileSync(path, data);
        },
      };

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
          scopeConfig: {
            directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
            excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            filteredByValidationPaths: true,
          },
        },
        { runner, deps },
      );

      expect(result.success).toBe(true);
      expect(writtenConfigPaths).toHaveLength(1);
      expect(writtenConfigPaths[0]?.startsWith(join(env.productDir, "node_modules"))).toBe(true);
      expect(writtenConfigPaths[0]?.startsWith(join(env.productDir, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS))).toBe(true);
      const writtenConfig = JSON.parse(writtenConfigs[0] ?? "{}");
      expect(writtenConfig.extends).toBe(join(env.productDir, TSCONFIG_FILES.full));
      expect(writtenConfig.compilerOptions).toEqual({ noEmit: true });
    });
  });

  it("writes the file-specific temporary config inside the project's node_modules and fabricates no compiler options", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const writtenConfigPaths: string[] = [];
      const writtenConfigs: string[] = [];
      const deps: TypeScriptDeps = {
        ...defaultTypeScriptDeps,
        writeFileSync(path, data) {
          writtenConfigPaths.push(path.toString());
          writtenConfigs.push(data.toString());
          defaultTypeScriptDeps.writeFileSync(path, data);
        },
      };

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          projectRoot: env.productDir,
          files: [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile],
        },
        { runner, deps },
      );

      expect(result.success).toBe(true);
      expect(writtenConfigPaths).toHaveLength(1);
      expect(writtenConfigPaths[0]?.startsWith(join(env.productDir, "node_modules"))).toBe(true);
      expect(writtenConfigPaths[0]?.startsWith(join(env.productDir, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS))).toBe(true);
      const writtenConfig = JSON.parse(writtenConfigs[0] ?? "{}");
      expect(writtenConfig.extends).toBe(join(env.productDir, TSCONFIG_FILES.full));
      expect(writtenConfig.compilerOptions).toEqual({ noEmit: true });
    });
  });
});
