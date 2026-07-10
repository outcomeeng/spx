/**
 * TypeScript validation language descriptor.
 *
 * Declares the validation stages a TypeScript project contributes to the
 * pipeline: circular-dependency detection, unused-code detection, ESLint,
 * type checking, and literal-reuse detection. The registry imports this
 * descriptor with an explicit import statement; orchestration never names
 * these stages directly.
 */
import { circularCommand } from "@/commands/validation/circular";
import { knipCommand } from "@/commands/validation/knip";
import { lintCommand } from "@/commands/validation/lint";
import { literalCommand } from "@/commands/validation/literal";
import {
  CIRCULAR_SKIP_JSON_OUTPUT,
  CIRCULAR_SKIP_OUTPUT,
  LITERAL_SKIP_JSON_OUTPUT,
  LITERAL_SKIP_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import type { ValidationCommandResult } from "@/commands/validation/types";
import { typescriptCommand } from "@/commands/validation/typescript";
import type { ValidationLanguageDescriptor, ValidationStageContext } from "@/validation/languages/types";

const TYPESCRIPT_LANGUAGE_NAME = "typescript";

export const TYPESCRIPT_VALIDATION_CONCERN = {
  LINT: "lint",
  TYPE_CHECK: "type-check",
  AST_ENFORCEMENT: "ast-enforcement",
  CIRCULAR_DEPS: "circular-deps",
  LITERAL_REUSE: "literal-reuse",
  UNUSED_CODE: "unused-code",
} as const;

export type TypeScriptValidationConcern =
  (typeof TYPESCRIPT_VALIDATION_CONCERN)[keyof typeof TYPESCRIPT_VALIDATION_CONCERN];

interface TypeScriptValidationLanguageDescriptor extends ValidationLanguageDescriptor {
  readonly concerns: readonly TypeScriptValidationConcern[];
}

export interface KnipStageDeps {
  readonly knipCommand: typeof knipCommand;
}

const defaultKnipStageDeps: KnipStageDeps = {
  knipCommand,
};

/**
 * Circular-dependency stage runner.
 *
 * A full-pipeline run may skip circular detection; the standalone circular
 * command remains the explicit way to run this check.
 */
async function runCircularStage(context: ValidationStageContext): Promise<ValidationCommandResult> {
  if (context.skipCircular) {
    const skipOutput = context.json ? CIRCULAR_SKIP_JSON_OUTPUT : CIRCULAR_SKIP_OUTPUT;
    return { exitCode: 0, output: context.quiet ? "" : skipOutput };
  }
  return circularCommand({
    cwd: context.cwd,
    scope: context.scope,
    files: context.files,
    quiet: context.quiet,
    json: context.json,
  });
}

/**
 * Literal-reuse stage runner.
 *
 * A full-pipeline run may skip literal detection; the skip emits the canonical
 * skip notice (text or JSON) and reports success without invoking the detector.
 */
async function runLiteralStage(context: ValidationStageContext): Promise<ValidationCommandResult> {
  if (context.skipLiteral) {
    const skipOutput = context.json ? LITERAL_SKIP_JSON_OUTPUT : LITERAL_SKIP_OUTPUT;
    return { exitCode: 0, output: context.quiet ? "" : skipOutput };
  }
  return literalCommand({
    cwd: context.cwd,
    scope: context.scope,
    files: context.files,
    quiet: context.quiet,
    json: context.json,
  });
}

export async function runKnipStage(
  context: ValidationStageContext,
  deps: KnipStageDeps = defaultKnipStageDeps,
): Promise<ValidationCommandResult> {
  return deps.knipCommand({
    cwd: context.cwd,
    scope: context.scope,
    files: context.files,
    quiet: context.quiet,
    json: context.json,
  });
}

export const typescriptValidationLanguage: TypeScriptValidationLanguageDescriptor = {
  name: TYPESCRIPT_LANGUAGE_NAME,
  concerns: Object.values(TYPESCRIPT_VALIDATION_CONCERN),
  stages: [
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
      failsPipeline: true,
      run: runCircularStage,
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
      // Knip is informational: unused-code findings never fail the pipeline.
      failsPipeline: false,
      run: runKnipStage,
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
      failsPipeline: true,
      run: (context) =>
        lintCommand({
          cwd: context.cwd,
          scope: context.scope,
          files: context.files,
          fix: context.fix,
          quiet: context.quiet,
          json: context.json,
          outputStreams: context.outputStreams,
        }),
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
      failsPipeline: true,
      run: (context) =>
        typescriptCommand({
          cwd: context.cwd,
          scope: context.scope,
          files: context.files,
          quiet: context.quiet,
          json: context.json,
          outputStreams: context.outputStreams,
        }),
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
      failsPipeline: true,
      run: runLiteralStage,
    },
  ],
};
