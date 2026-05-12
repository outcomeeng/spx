import { describe, expect, it } from "vitest";

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { join } from "node:path";

import { getTypeScriptScope } from "@/validation/config/scope";
import {
  CIRCULAR_DEPS_KEYS,
  type CircularDependencyGraphRunner,
  type CircularDeps,
  validateCircularDependencies,
} from "@/validation/steps/circular";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { defaultTypeScriptDeps, type TypeScriptDeps, validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

class RecordingChild extends EventEmitter {
  kill(): boolean {
    return true;
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

class RecordingRunner {
  readonly commands: string[] = [];
  readonly options: SpawnOptions[] = [];

  spawn(command: string, _args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.options.push(options ?? {});
    const child = new RecordingChild();
    queueMicrotask(() => child.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, 0));
    return child.asChildProcess();
  }
}

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

  it("runs TypeScript validation from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      const runner = new RecordingRunner();
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
      const runner = new RecordingRunner();
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
