/**
 * Formatting validation harness.
 *
 * Owns the lifecycle of the dprint formatting stage's evidence: hermetic temp
 * products that carry a copy of the product's `dprint.jsonc` (so the pinned,
 * cached plugins resolve), the real `dprint` binary from `PATH`, recording
 * stream and context boundaries, and the participation-observable stage. Each
 * function returns what it observed; the linked test files assert on it.
 */

import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { stringify } from "yaml";

import { allCommand } from "@/commands/validation/all";
import {
  FORMATTING_COMMAND_OUTPUT,
  formattingCommand,
  type FormattingCommandDependencies,
} from "@/commands/validation/formatting";
import type { FormattingCommandOptions, ValidationCommandResult } from "@/commands/validation/types";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { DPRINT_EXECUTABLE_SPECIFIER, type FormattingValidationContext } from "@/validation/steps/formatting";
import type { ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { FORMATTING_VALIDATION_DATA } from "@testing/generators/validation/formatting";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const execFileAsync = promisify(execFile);

const DPRINT_COMMAND_NAME = "dprint";
const DPRINT_FORMAT_SUBCOMMAND = "fmt";
const GIT_COMMAND_NAME = "git";
const GIT_INIT_SUBCOMMAND = "init";
const FORMATTING_TEMP_PREFIX = "dprint-validation-";
const LINE_TERMINATOR = "\n";

/**
 * Independent oracle for the spawned dprint path: resolved here from the
 * source-owned specifier rather than through the production resolver, so a
 * defect in that resolver is caught instead of mirrored.
 */
export const EXPECTED_DPRINT_COMMAND = createRequire(import.meta.url).resolve(DPRINT_EXECUTABLE_SPECIFIER);

/** Per-test timeout for evidence that runs the real dprint binary. */
export const FORMATTING_HARNESS_TIMEOUT = 30_000;

/** A writable stream that records each chunk the formatting stage forwards. */
export class RecordingFormattingWritable extends EventEmitter implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

/** A temp product holding the product's dprint config and one root source file. */
export interface FormattingFixture {
  readonly productDir: string;
  readonly sourceFile: string;
}

/** The `validation.paths` filters a fixture's `spx.config.yaml` declares. */
export interface ValidationPathFilters {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

/** What a formatting run with full-pipeline participation and its override observed. */
export interface FormattingParticipationObservation {
  readonly defaultParticipation: string;
  readonly overrideFlag: string;
  readonly defaultResult: ValidationCommandResult;
  readonly overriddenResult: ValidationCommandResult;
  readonly executionCount: number;
}

/** Runs `callback` in a temp product whose root source file holds `sourceContent`. */
export async function withFormattingFixture<T>(
  sourceContent: string,
  callback: (fixture: FormattingFixture) => Promise<T>,
): Promise<T> {
  return withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    copyProductDprintConfig(productDir);
    const sourceFile = join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
    await writeFile(sourceFile, sourceContent);
    return callback({ productDir, sourceFile });
  });
}

/** Runs `callback` in a temp product that holds only the product's dprint config. */
export async function withFormattingFixtureFiles<T>(callback: (productDir: string) => Promise<T>): Promise<T> {
  return withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    copyProductDprintConfig(productDir);
    return callback(productDir);
  });
}

/** Writes `content` at the product-relative `relativePath`, creating its directories. */
export async function writeFixtureFile(productDir: string, relativePath: string, content: string): Promise<void> {
  const target = join(productDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

/** Writes the fixture's `spx.config.yaml` with the given `validation.paths` filters. */
export async function writeValidationPathFilters(productDir: string, paths: ValidationPathFilters): Promise<void> {
  await writeFile(
    join(productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
    stringify({ validation: { paths } }),
  );
}

/** Writes a `.gitignore` that ignores each of `ignoredPaths`. */
export async function writeGitignore(productDir: string, ignoredPaths: readonly string[]): Promise<void> {
  await writeFile(
    join(productDir, FORMATTING_VALIDATION_DATA.gitignoreFilename),
    ignoredPaths.map((path) => `${path}${LINE_TERMINATOR}`).join(""),
  );
}

/** Formats the fixture's source file with the real `dprint fmt`, so a clean product never depends on the repository. */
export async function canonicalizeFixture(fixture: FormattingFixture): Promise<void> {
  await execFileAsync(DPRINT_COMMAND_NAME, [DPRINT_FORMAT_SUBCOMMAND, basename(fixture.sourceFile)], {
    cwd: fixture.productDir,
  });
}

/** Makes the fixture a git repository, so the effective invocation directory resolves to its root. */
export async function initializeGitProductDir(productDir: string): Promise<void> {
  await execFileAsync(GIT_COMMAND_NAME, [GIT_INIT_SUBCOMMAND], { cwd: productDir });
}

/**
 * Runs the formatting command with a validation boundary that records each
 * context it receives and validates nothing, and returns those contexts.
 */
export async function recordFormattingContexts(
  options: FormattingCommandOptions,
): Promise<readonly FormattingValidationContext[]> {
  const contexts: FormattingValidationContext[] = [];
  await formattingCommand(options, {
    validateFormatting: async (context) => {
      contexts.push(context);
      return { success: true, output: FORMATTING_COMMAND_OUTPUT.NO_ISSUES };
    },
  });
  return contexts;
}

/**
 * Runs the formatting command against a temp product that has no `dprint.jsonc`
 * and carries an unformatted file.
 */
export function runFormattingWithoutConfig(
  dependencies?: FormattingCommandDependencies,
): Promise<ValidationCommandResult> {
  return withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    return formattingCommand({ cwd: productDir }, dependencies);
  });
}

/**
 * Runs `spx validation all` over the registered formatting stage, once with no
 * participation override and once with the stage's invocation-local override,
 * through a stage whose run counts its executions.
 */
export async function observeFormattingParticipation(): Promise<FormattingParticipationObservation> {
  const formattingStage = formattingValidationLanguage.stages[0];
  const override = formattingStage.participation.override;
  let executionCount = 0;
  const observableStage = {
    ...formattingStage,
    run: async () => {
      executionCount += 1;
      return {
        exitCode: FORMATTING_VALIDATION_DATA.passExitCode,
        output: FORMATTING_COMMAND_OUTPUT.NO_ISSUES,
      };
    },
  };

  const defaultResult = await allCommand({ cwd: process.cwd(), validationStages: [observableStage] });
  const overriddenResult = await allCommand({
    cwd: process.cwd(),
    validationStages: [observableStage],
    participationOverrides: [override.flag],
  });

  return {
    defaultParticipation: formattingStage.participation.default,
    overrideFlag: override.flag,
    defaultResult,
    overriddenResult,
    executionCount,
  };
}

function copyProductDprintConfig(productDir: string): void {
  const source = readFileSync(join(process.cwd(), FORMATTING_VALIDATION_DATA.dprintConfigFilename), "utf8");
  writeFileSync(join(productDir, FORMATTING_VALIDATION_DATA.dprintConfigFilename), source);
}
