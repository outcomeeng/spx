/** Semantic fragments every release-notes producer prompt must carry. */
export const RELEASE_NOTES_PROMPT_CONTRACT = {
  PRESERVATION_REQUIRED_FRAGMENTS: [
    "read it first",
    "preserve existing version sections",
    "replace only this release version's section",
    "otherwise insert this release section",
    "without deleting older sections",
  ],
  USER_FACING_REQUIRED_FRAGMENTS: [
    "product users",
    "externally observable capabilities and effects",
    "consolidate related commits",
    "user-facing entry",
    "Omit only",
    "spec-only",
    "test-only",
    "release-mechanics",
    "internal implementation changes",
    "no observable effect",
  ],
  VERSION_HEADING_REQUIRED_FRAGMENTS: [
    "H2 heading",
    "concatenating",
    "decoded string from the release-version JSON data block",
    "write no quotes, escapes, or other text on that heading line",
  ],
} as const;
