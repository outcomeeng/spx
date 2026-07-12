/**
 * TypeScript validation language descriptor.
 *
 * Declares the validation stages a TypeScript product contributes to the
 * pipeline: circular-dependency detection, unused-code detection, ESLint,
 * type checking, and literal-reuse detection. The registry imports this
 * descriptor with an explicit import statement; orchestration never names
 * these stages directly.
 */
import { circularCommand } from "@/commands/validation/circular";
import { knipCommand } from "@/commands/validation/knip";
import { lintCommand } from "@/commands/validation/lint";
import { literalCommand } from "@/commands/validation/literal";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import type { ValidationCommandResult } from "@/commands/validation/types";
import { typescriptCommand } from "@/commands/validation/typescript";
import {
  VALIDATION_STAGE_PARTICIPATION,
  type ValidationLanguageDescriptor,
  type ValidationStageContext,
  type ValidationStageParticipationPolicy,
} from "@/validation/languages/types";

const TYPESCRIPT_LANGUAGE_NAME = "typescript";
const SKIP_CIRCULAR_REASON = "skip-circular";
const SKIP_LITERAL_REASON = "skip-literal";

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

export interface TypeScriptValidationLanguageDescriptor extends ValidationLanguageDescriptor {
  readonly concerns: readonly TypeScriptValidationConcern[];
}

const RUN_BY_DEFAULT: ValidationStageParticipationPolicy = {
  default: VALIDATION_STAGE_PARTICIPATION.RUN,
};

const circularParticipation: ValidationStageParticipationPolicy = {
  default: VALIDATION_STAGE_PARTICIPATION.RUN,
  override: {
    flag: "--skip-circular",
    description: "Skip circular dependency detection for this validation all run",
    participation: VALIDATION_STAGE_PARTICIPATION.SKIP,
    reason: SKIP_CIRCULAR_REASON,
  },
};

const literalParticipation: ValidationStageParticipationPolicy = {
  default: VALIDATION_STAGE_PARTICIPATION.RUN,
  override: {
    flag: "--skip-literal",
    description: "Skip literal reuse detection for this validation all run",
    participation: VALIDATION_STAGE_PARTICIPATION.SKIP,
    reason: SKIP_LITERAL_REASON,
  },
};

export interface KnipStageDeps {
  readonly knipCommand: typeof knipCommand;
}

const defaultKnipStageDeps: KnipStageDeps = {
  knipCommand,
};

async function runCircularStage(context: ValidationStageContext): Promise<ValidationCommandResult> {
  return circularCommand({
    cwd: context.cwd,
    scope: context.scope,
    files: context.files,
    quiet: context.quiet,
    json: context.json,
  });
}

async function runLiteralStage(context: ValidationStageContext): Promise<ValidationCommandResult> {
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
      participation: circularParticipation,
      run: runCircularStage,
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
      failsPipeline: true,
      participation: RUN_BY_DEFAULT,
      run: runKnipStage,
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
      failsPipeline: true,
      participation: RUN_BY_DEFAULT,
      run: (context) =>
        lintCommand({
          cwd: context.cwd,
          scope: context.scope,
          files: context.files,
          fix: context.fix,
          quiet: context.quiet,
          json: context.json,
          streamedPipelineOutput: true,
          outputStreams: context.outputStreams,
        }),
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
      failsPipeline: true,
      participation: RUN_BY_DEFAULT,
      run: (context) =>
        typescriptCommand({
          cwd: context.cwd,
          scope: context.scope,
          files: context.files,
          quiet: context.quiet,
          json: context.json,
          streamedPipelineOutput: true,
          outputStreams: context.outputStreams,
        }),
    },
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
      failsPipeline: true,
      participation: literalParticipation,
      run: runLiteralStage,
    },
  ],
};
