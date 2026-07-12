/**
 * Formatting validation language descriptor.
 *
 * Declares the single dprint formatting stage. Its own descriptor keeps
 * formatting independent of the TypeScript and markdown languages, so the
 * stage composes into the pipeline through the registry without inheriting or
 * being inherited by another language's stages.
 */
import { formattingCommand } from "@/commands/validation/formatting";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import {
  VALIDATION_STAGE_PARTICIPATION,
  type ValidationLanguageDescriptor,
  type ValidationStageParticipationPolicy,
} from "@/validation/languages/types";

const FORMATTING_LANGUAGE_NAME = "formatting";
const SKIP_FORMATTING_REASON = "skip-formatting";
const formattingParticipation: ValidationStageParticipationPolicy = {
  default: VALIDATION_STAGE_PARTICIPATION.RUN,
  override: {
    flag: "--skip-formatting",
    description: "Skip formatting validation for this validation all run",
    participation: VALIDATION_STAGE_PARTICIPATION.SKIP,
    reason: SKIP_FORMATTING_REASON,
  },
};

export const formattingValidationLanguage: ValidationLanguageDescriptor = {
  name: FORMATTING_LANGUAGE_NAME,
  stages: [
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING,
      failsPipeline: true,
      participation: formattingParticipation,
      run: (context) =>
        formattingCommand({
          cwd: context.cwd,
          files: context.files,
          quiet: context.quiet,
          json: context.json,
          streamedPipelineOutput: true,
          outputStreams: context.outputStreams,
        }),
    },
  ],
};
