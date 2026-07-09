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
import { VALIDATION_STAGE_PARTICIPATION, type ValidationLanguageDescriptor } from "@/validation/languages/types";

const FORMATTING_LANGUAGE_NAME = "formatting";
const RUN_BY_DEFAULT = { default: VALIDATION_STAGE_PARTICIPATION.RUN } as const;

export const formattingValidationLanguage: ValidationLanguageDescriptor = {
  name: FORMATTING_LANGUAGE_NAME,
  stages: [
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING,
      failsPipeline: true,
      participation: RUN_BY_DEFAULT,
      run: (context) => formattingCommand({ cwd: context.cwd, files: context.files, quiet: context.quiet }),
    },
  ],
};
