/**
 * Validation scratch-directory harness: runs each validation stage that writes a temporary
 * `tsconfig.json` against a product directory inside a temp-directory host worktree, and returns
 * what the stage left in the product's scratch parent while the tool ran and after the stage ended.
 *
 * Every directory comes from the temp-directory primitive through the host's run. The tool process is
 * a recording runner that snapshots the scratch parent at the instant the stage spawns it and then
 * exits with the requested code, so the harness never runs the real compiler or Knip. The harness
 * returns observations and handles only; it asserts nothing and returns no verdict.
 *
 * @module testing/harnesses/validation/scratch-directories
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { type KnipDeps, validateKnip } from "@/validation/steps/knip";
import { defaultTypeScriptDeps, type TypeScriptDeps, validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryProductSegments } from "@testing/generators/temp-directory/temp-directory";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTempDirectoryHost } from "@testing/harnesses/temp-directory/temp-directory";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

/** The validation stages that write a temporary `tsconfig.json` into a scratch directory. */
export const VALIDATION_SCRATCH_STAGE = {
  TYPESCRIPT_SCOPE_FILTERED: "typescript-scope-filtered",
  TYPESCRIPT_FILE_SPECIFIC: "typescript-file-specific",
  KNIP_SCOPE_FILTERED: "knip-scope-filtered",
} as const;

export type ValidationScratchStage = (typeof VALIDATION_SCRATCH_STAGE)[keyof typeof VALIDATION_SCRATCH_STAGE];

/** What one stage left in the scratch parent, observed at the points the assertion names. */
export interface ValidationScratchStageObservation {
  /** Entry names in the scratch parent at the instant the stage spawned its tool process. */
  readonly entriesDuringStage: readonly string[];
  /** Entry names in the scratch parent once the stage returned. */
  readonly entriesAfterStage: readonly string[];
  /** The directory of every temporary `tsconfig.json` the stage wrote. */
  readonly configDirectories: readonly string[];
}

export interface ValidationScratchRun {
  /** A product directory inside the worktree the run lives in. */
  readonly productDirectory: string;
  /** The product's scratch parent, which exists only once a stage requested a scratch directory. */
  readonly scratchParent: string;
  /** Every path the primitive removed through its filesystem dependency, in order. */
  readonly removed: readonly string[];
  /** Knip dependencies wired to this run's primitive and the real filesystem. */
  readonly knipDeps: KnipDeps;
  /** Creates a leftover entry named `name` in the scratch parent, as a killed run or another tool left it. */
  seedEntry(name: string): void;
  /** Entry names currently in the scratch parent; empty while the parent does not exist. */
  scratchEntries(): string[];
  /** Runs `stage` with a tool process that exits with `exitCode`, and returns what the stage left behind. */
  runStage(stage: ValidationScratchStage, exitCode: number): Promise<ValidationScratchStageObservation>;
}

class ScratchObservingRunner extends RecordingSpawnOptionsRunner {
  readonly entriesAtSpawn: string[][] = [];

  constructor(
    exitCode: number,
    private readonly readEntries: () => string[],
  ) {
    super([exitCode]);
  }

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.entriesAtSpawn.push(this.readEntries());
    return super.spawn(command, args, options);
  }
}

/**
 * Runs `callback` with a product directory in a fresh temp-directory host worktree and removes the
 * host with everything inside it afterwards.
 */
export async function withValidationScratchRun<T>(
  callback: (scratch: ValidationScratchRun) => Promise<T>,
): Promise<T> {
  return withTempDirectoryHost(async (host) => {
    const run = host.openRun();
    const productDirectory = host.createProductDirectory(
      run.worktreeRoot,
      sampleGeneratedValue(arbitraryProductSegments()),
    );
    const scratchParent = join(productDirectory, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS);
    const scratchEntries = (): string[] => existsSync(scratchParent) ? readdirSync(scratchParent) : [];

    const knipDeps: KnipDeps = {
      existsSync: () => false,
      tempDirectory: run.tempDirectory,
      writeFile,
    };

    return callback({
      productDirectory,
      scratchParent,
      get removed() {
        return run.removed;
      },
      knipDeps,
      seedEntry: (name) => host.seedLeftover(join(scratchParent, name)),
      scratchEntries,
      async runStage(stage, exitCode) {
        const runner = new ScratchObservingRunner(exitCode, scratchEntries);
        const configDirectories: string[] = [];
        const typeScriptDeps: TypeScriptDeps = {
          ...defaultTypeScriptDeps,
          tempDirectory: run.tempDirectory,
          writeFileSync(path, data) {
            configDirectories.push(dirname(path.toString()));
            defaultTypeScriptDeps.writeFileSync(path, data);
          },
        };

        if (stage === VALIDATION_SCRATCH_STAGE.TYPESCRIPT_SCOPE_FILTERED) {
          await validateTypeScript(
            {
              scope: VALIDATION_SCOPES.FULL,
              productDir: productDirectory,
              scopeConfig: {
                directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
                filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
                excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
                filteredByValidationPaths: true,
              },
            },
            { runner, deps: typeScriptDeps },
          );
        } else if (stage === VALIDATION_SCRATCH_STAGE.TYPESCRIPT_FILE_SPECIFIC) {
          await validateTypeScript(
            {
              scope: VALIDATION_SCOPES.FULL,
              productDir: productDirectory,
              files: [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile],
            },
            { runner, deps: typeScriptDeps },
          );
        } else {
          await validateKnip(
            {
              productDir: productDirectory,
              typescriptScope: {
                directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
                filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
                excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
                filteredByValidationPaths: true,
              },
            },
            runner,
            {
              ...knipDeps,
              writeFile: async (path, data) => {
                configDirectories.push(dirname(path.toString()));
                await writeFile(path, data);
              },
            },
          );
        }

        return {
          entriesDuringStage: runner.entriesAtSpawn[0] ?? [],
          entriesAfterStage: scratchEntries(),
          configDirectories,
        };
      },
    });
  });
}
