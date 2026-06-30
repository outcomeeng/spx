import type { Linter } from "eslint";

import { NO_TASK_MARKER_COMMENTS_RULE_ID } from "./no-task-marker-comments";

/**
 * Type-aware parser options. The rules that detect redundant assertions,
 * superfluous narrowings, and alphabetical sorts require TypeScript type
 * information, so the mirror enables the project service rather than relying on
 * syntax-only parsing.
 */
export const TYPE_AWARE_PARSER_OPTIONS = {
  projectService: true,
} as const;

/**
 * Warn tier: finding classes whose existing backlog is uncleared. Warn keeps
 * `spx validation lint` green over the current findings while they surface
 * before push; a class graduates to the error tier when its last occurrence is
 * cleared.
 */
export const MIRROR_WARN_SEVERITY = "warn" as const;

/**
 * Error tier: finding classes with no remaining occurrence in the linted tree.
 * Any new finding of an error-tier class fails `spx validation`.
 */
export const MIRROR_ERROR_SEVERITY = "error" as const;

/**
 * The warn-tier rules: the type-aware `@typescript-eslint` narrowing rule
 * dormant without the project service, SonarJS analyzer rules whose backlog is
 * not yet cleared, and the unicorn-family modernization rules — provided by
 * `eslint-plugin-unicorn` for the SonarQube analyzer rules `eslint-plugin-sonarjs`
 * does not package — whose backlog is likewise uncleared. They surface findings
 * locally without failing the gate.
 */
export const MIRROR_WARN_RULES: Linter.RulesRecord = {
  "@typescript-eslint/no-unnecessary-condition": MIRROR_WARN_SEVERITY,
  "sonarjs/no-identical-expressions": MIRROR_WARN_SEVERITY,
  "unicorn/prefer-node-protocol": MIRROR_WARN_SEVERITY,
  "unicorn/prefer-code-point": MIRROR_WARN_SEVERITY,
  "unicorn/prefer-single-call": MIRROR_WARN_SEVERITY,
  "unicorn/prefer-string-raw": MIRROR_WARN_SEVERITY,
};

/**
 * The SonarJS rule mirroring SonarQube S2871 (array sort without a compare
 * function) — type-aware, and exempting the
 * `JSON.stringify(a.sort()) === JSON.stringify(b.sort())` normalization idiom.
 */
export const ARRAY_SORT_COMPARATOR_RULE = "sonarjs/no-alphabetical-sort" as const;
export const COGNITIVE_COMPLEXITY_RULE = "sonarjs/cognitive-complexity" as const;
export const PSEUDO_RANDOM_RULE = "sonarjs/pseudo-random" as const;
export const REDUNDANT_ASSERTION_RULE = "@typescript-eslint/no-unnecessary-type-assertion" as const;
export const OBJECT_HAS_OWN_RULE = "prefer-object-has-own" as const;
export const DUPLICATE_IMPORT_RULE = "import/no-duplicates" as const;
export const TASK_MARKER_COMMENT_RULE = NO_TASK_MARKER_COMMENTS_RULE_ID;
export const TASK_MARKER_COMMENT_FALLBACK_FILES = ["eslint-rules/**/*.ts", "*.config.ts"] as const;

/**
 * The error-tier rules: finding classes fully cleared from the linted tree, so a
 * new finding blocks the push. Each mirrors a SonarQube finding through an
 * already-present ESLint rule — SonarJS, `@typescript-eslint`, ESLint core, or
 * `eslint-plugin-import`.
 */
export const MIRROR_ERROR_RULES: Linter.RulesRecord = {
  [ARRAY_SORT_COMPARATOR_RULE]: MIRROR_ERROR_SEVERITY,
  [COGNITIVE_COMPLEXITY_RULE]: MIRROR_ERROR_SEVERITY,
  [PSEUDO_RANDOM_RULE]: MIRROR_ERROR_SEVERITY,
  // S4325 redundant casts / non-null assertions (type-aware).
  [REDUNDANT_ASSERTION_RULE]: MIRROR_ERROR_SEVERITY,
  // S6653 prefer Object.hasOwn over Object.prototype.hasOwnProperty.
  [OBJECT_HAS_OWN_RULE]: MIRROR_ERROR_SEVERITY,
  // S3863 merge duplicate imports from the same module.
  [DUPLICATE_IMPORT_RULE]: MIRROR_ERROR_SEVERITY,
  // S1135 explicit task markers.
  [TASK_MARKER_COMMENT_RULE]: MIRROR_ERROR_SEVERITY,
};

/**
 * The curated lint mirror: the union of the warn and error tiers, run locally so
 * findings surface before push. Backlog sessions extend these tiers and graduate
 * a class from warn to error as its batch clears.
 */
export const MIRROR_RULES: Linter.RulesRecord = {
  ...MIRROR_WARN_RULES,
  ...MIRROR_ERROR_RULES,
};
