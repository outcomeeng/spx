import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { TEMPORARY_TSCONFIG_PARENT_SEGMENTS, TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS } from "@/validation/config/scope";
import {
  type CircularDependencyGraphRunner,
  DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES,
} from "@/validation/steps/circular";
import type { KnipDeps } from "@/validation/steps/knip";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { defaultTypeScriptDeps, type TypeScriptDeps } from "@/validation/steps/typescript";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

export function createRootRecordingDeps(productDir: string, checkedPaths: string[]): TypeScriptDeps {
  return {
    ...defaultTypeScriptDeps,
    existsSync(path) {
      const checkedPath = path.toString();
      checkedPaths.push(checkedPath);
      return checkedPath.startsWith(productDir);
    },
  };
}

export function createDependencyGraphResult(): Awaited<ReturnType<CircularDependencyGraphRunner>> {
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

export function expectedDependencyCruiserSourcePatterns(directory: string): string[] {
  return DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES.map((suffix) => join(directory, suffix));
}

export function expectedKnipDirectorySourcePatterns(directory: string): string[] {
  return TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS.map((pattern) => join(directory, pattern));
}

interface RecordingKnipDepsContext {
  readonly writtenConfigs: string[];
  readonly writtenConfigPaths: string[];
  readonly deps: KnipDeps;
}

interface RecordingTypeScriptDepsContext {
  readonly writtenConfigs: string[];
  readonly writtenConfigPaths: string[];
  readonly deps: TypeScriptDeps;
}

export function createRecordingKnipDeps(): RecordingKnipDepsContext {
  const writtenConfigs: string[] = [];
  const writtenConfigPaths: string[] = [];
  return {
    writtenConfigs,
    writtenConfigPaths,
    deps: {
      existsSync: () => false,
      mkdir,
      mkdtemp: defaultTypeScriptDeps.mkdtemp,
      rm: async () => {},
      writeFile: async (path, data) => {
        writtenConfigPaths.push(path.toString());
        writtenConfigs.push(data.toString());
      },
    },
  };
}

export function createRecordingTypeScriptDeps(): RecordingTypeScriptDepsContext {
  const writtenConfigs: string[] = [];
  const writtenConfigPaths: string[] = [];
  return {
    writtenConfigs,
    writtenConfigPaths,
    deps: {
      ...defaultTypeScriptDeps,
      writeFileSync(path, data) {
        writtenConfigPaths.push(path.toString());
        writtenConfigs.push(data.toString());
        defaultTypeScriptDeps.writeFileSync(path, data);
      },
    },
  };
}

export function expectTemporaryConfigPathInsideNodeModules(productDir: string, configPath: string | undefined): void {
  expect(configPath?.startsWith(join(productDir, "node_modules"))).toBe(true);
  expect(configPath?.startsWith(join(productDir, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS))).toBe(true);
}

export const narrowSourceDirectory = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
);
const deepSourceDirectory = join(
  narrowSourceDirectory,
  VALIDATION_PIPELINE_DATA.deepSourceDirectoryName,
  VALIDATION_PIPELINE_DATA.nestedSourceDirectoryName,
);
export const topLevelSourceFile = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.cleanSourceFileName,
);
export const nestedSourceFile = join(narrowSourceDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
export const deepSourceFile = join(deepSourceDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName);
export const extensionlessNestedPath = join(
  VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  VALIDATION_PIPELINE_DATA.extensionlessSourceFileName,
);

export class ErrorThenCloseRunner implements ProcessRunner {
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
