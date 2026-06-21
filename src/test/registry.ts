/**
 * Testing language registry.
 *
 * Composes the `spx test` dispatch from explicitly imported language testing
 * descriptors. Orchestration iterates `testingRegistry.languages`; it never
 * references a language by name and never discovers descriptors through
 * filesystem scanning. Adding a language is one descriptor module plus one entry
 * here.
 */
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";

export interface TestingRegistry {
  readonly languages: readonly TestingLanguageDescriptor[];
}

export const testingRegistry: TestingRegistry = {
  languages: [typescriptTestingLanguage, pythonTestingLanguage],
};
