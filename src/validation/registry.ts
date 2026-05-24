/**
 * Validation language registry.
 *
 * Composes the validation pipeline from explicitly imported language
 * descriptors. Orchestration code iterates `validationPipelineStages`; it never
 * references a language or stage by name and never discovers descriptors through
 * filesystem scanning. Adding a language is one descriptor module plus one entry
 * here.
 */
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import type { ValidationRegistry } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";

export const validationRegistry: ValidationRegistry = {
  languages: [typescriptValidationLanguage, markdownValidationLanguage],
};

/** Flattened, ordered pipeline stages composed from every registered language. */
export const validationPipelineStages = validationRegistry.languages.flatMap(
  (language) => language.stages,
);

/** Total pipeline step count, derived from the registry rather than a constant. */
export const VALIDATION_PIPELINE_TOTAL_STEPS = validationPipelineStages.length;
