import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getTypeScriptScope, TSCONFIG_FILES } from "@/validation/config/scope";
import {
  CIRCULAR_DEPS_KEYS,
  type CircularDependencyGraphRunner,
  type CircularDeps,
  validateCircularDependencies,
} from "@/validation/steps/circular";
import { type KnipDeps, validateKnip } from "@/validation/steps/knip";
import { KNIP_COMMAND_TOKENS } from "@/validation/steps/knip";
import { defaultTypeScriptDeps, type TypeScriptDeps, validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

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
    obj: () => ({}),
    warnings: () => ({ skipped: [] }),
    circular: () => [],
    circularGraph: () => ({}),
    depends: () => [],
    orphans: () => [],
    leaves: () => [],
    dot: async () => "",
    image: async () => "",
    svg: async () => Buffer.from(""),
  };
}

describe("ALWAYS: TypeScript scope resolution uses the requested project root", () => {
  it("discovers TypeScript directories under the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile, "");

      const scope = getTypeScriptScope(VALIDATION_SCOPES.FULL, env.projectDir);

      expect(scope.directories).toContain(VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName);
    });
  });

  it("resolves array-based TypeScript config extends without crashing", async () => {
    await withTestEnv({}, async (env) => {
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

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.projectDir);

      expect(scope.filePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeFilePattern]);
      expect(scope.excludePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeExcludePattern]);
    });
  });

  it("lets child TypeScript exclude replace inherited excludes", async () => {
    await withTestEnv({}, async (env) => {
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

      const scope = getTypeScriptScope(VALIDATION_SCOPES.PRODUCTION, env.projectDir);

      expect(scope.excludePatterns).toEqual([VALIDATION_PIPELINE_DATA.productionScopeExcludePattern]);
    });
  });

  it("runs TypeScript validation from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const checkedPaths: string[] = [];
      const deps = createRootRecordingDeps(env.projectDir, checkedPaths);

      const result = await validateTypeScript(
        VALIDATION_SCOPES.FULL,
        env.projectDir,
        undefined,
        runner,
        deps,
      );

      expect(result.success).toBe(true);
      expect(checkedPaths.every((path) => path.startsWith(env.projectDir))).toBe(true);
      expect(runner.commands.every((command) => command.startsWith(env.projectDir))).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.projectDir)).toBe(true);
    });
  });

  it("runs file-scoped TypeScript validation from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingSpawnOptionsRunner();
      const checkedPaths: string[] = [];
      const deps = createRootRecordingDeps(env.projectDir, checkedPaths);

      const result = await validateTypeScript(
        VALIDATION_SCOPES.FULL,
        env.projectDir,
        [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile],
        runner,
        deps,
      );

      expect(result.success).toBe(true);
      expect(checkedPaths.every((path) => path.startsWith(env.projectDir))).toBe(true);
      expect(runner.commands.every((command) => command.startsWith(env.projectDir))).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.projectDir)).toBe(true);
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
        VALIDATION_SCOPES.FULL,
        env.projectDir,
        undefined,
        runner,
        deps,
        undefined,
        {
          directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
          filteredByValidationPaths: true,
        },
      );

      expect(result.success).toBe(true);
      expect(runner.options.every((options) => options.cwd === env.projectDir)).toBe(true);
      expect(writtenConfigs).toHaveLength(1);
      expect(JSON.parse(writtenConfigs[0] ?? "{}")).toMatchObject({
        include: [join(env.projectDir, VALIDATION_PIPELINE_DATA.productionScopeFilePattern)],
        exclude: [join(env.projectDir, VALIDATION_PIPELINE_DATA.productionScopeExcludePattern)],
      });
    });
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
          projectRoot: env.projectDir,
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
      expect(runner.options.every((options) => options.cwd === env.projectDir)).toBe(true);
      expect(runner.args[0]?.slice(0, 2)).toEqual([
        KNIP_COMMAND_TOKENS.COMMAND,
        KNIP_COMMAND_TOKENS.CONFIG_FLAG,
      ]);
      expect(writtenConfigs).toHaveLength(1);
      expect(JSON.parse(writtenConfigs[0] ?? "{}")).toEqual({
        project: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        ignore: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
      });
    });
  });

  it("runs circular validation with project-root-anchored Madge inputs", async () => {
    await withTestEnv({}, async (env) => {
      const dependencyGraphCalls: Parameters<CircularDependencyGraphRunner>[] = [];
      const deps: CircularDeps = {
        [CIRCULAR_DEPS_KEYS.MADGE]: async (...call) => {
          dependencyGraphCalls.push(call);
          return createDependencyGraphResult();
        },
      };

      const result = await validateCircularDependencies(
        VALIDATION_SCOPES.FULL,
        {
          directories: [VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName],
          filePatterns: [],
          excludePatterns: [],
        },
        env.projectDir,
        deps,
      );

      expect(result.success).toBe(true);
      expect(dependencyGraphCalls).toHaveLength(1);
      const [paths, config] = dependencyGraphCalls[0] ?? [];
      expect(paths).toEqual([join(env.projectDir, VALIDATION_PIPELINE_DATA.scopeResolutionDirectoryName)]);
      expect(config?.baseDir).toBe(env.projectDir);
      expect(config?.tsConfig).toBe(join(env.projectDir, VALIDATION_PIPELINE_DATA.fullTsconfigFile));
    });
  });
});
