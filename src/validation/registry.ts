/**
 * Validation language registry.
 *
 * Composes the validation pipeline from explicitly imported language
 * descriptors. Orchestration code iterates `validationPipelineStages`; it never
 * references a language or stage by name and never discovers descriptors through
 * filesystem scanning. Adding a language is one descriptor module plus one entry
 * here.
 */
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import type { ValidationLanguageDescriptor, ValidationRegistry, ValidationStage } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";

export const VALIDATION_REGISTRY_LANGUAGES = [
  typescriptValidationLanguage,
  markdownValidationLanguage,
  formattingValidationLanguage,
] as const satisfies readonly ValidationLanguageDescriptor[];

export const validationRegistry: ValidationRegistry = {
  languages: VALIDATION_REGISTRY_LANGUAGES,
};

/** Flatten a language set into its ordered pipeline stages. */
export function composeValidationPipelineStages(
  languages: readonly ValidationLanguageDescriptor[],
): readonly ValidationStage[] {
  return languages.flatMap((language) => language.stages);
}

/** Flattened, ordered pipeline stages composed from every registered language. */
export const validationPipelineStages = composeValidationPipelineStages(validationRegistry.languages);

/** Total pipeline step count, derived from the registry rather than a constant. */
export const VALIDATION_PIPELINE_TOTAL_STEPS = validationPipelineStages.length;
