/**
 * Markdown validation language descriptor.
 *
 * Declares the single markdown-quality stage. Splitting markdown into its own
 * descriptor keeps it independent of the TypeScript language so future
 * descriptors compose without inheriting markdown validation.
 */
import { markdownCommand } from "@/commands/validation/markdown";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationLanguageDescriptor } from "@/validation/languages/types";

const MARKDOWN_LANGUAGE_NAME = "markdown";
const RUN_BY_DEFAULT = { default: VALIDATION_STAGE_PARTICIPATION.RUN } as const;

export const markdownValidationLanguage: ValidationLanguageDescriptor = {
  name: MARKDOWN_LANGUAGE_NAME,
  stages: [
    {
      name: VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN,
      failsPipeline: true,
      participation: RUN_BY_DEFAULT,
      run: (context) => markdownCommand({ cwd: context.cwd, files: context.files, quiet: context.quiet }),
    },
  ],
};
