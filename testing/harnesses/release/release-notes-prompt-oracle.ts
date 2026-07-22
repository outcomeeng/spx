const RELEASE_NOTES_USER_VISIBLE_TERM_GROUPS = [
  ["product", "users"],
  ["observable", "capabilities", "effects"],
  ["consolidate", "related", "user-facing"],
  ["omit", "spec-only", "test-only", "release-mechanics", "internal"],
] as const;

const PROMPT_TERM_PATTERN = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

export interface ReleaseNotesPromptLanguageObservation {
  readonly terms: ReadonlySet<string>;
}

export function observeReleaseNotesPromptLanguage(prompt: string): ReleaseNotesPromptLanguageObservation {
  return {
    terms: new Set(prompt.toLowerCase().match(PROMPT_TERM_PATTERN) ?? []),
  };
}

export { RELEASE_NOTES_USER_VISIBLE_TERM_GROUPS };
