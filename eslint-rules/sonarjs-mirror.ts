import type { Linter } from "eslint";

/**
 * Type-aware parser options. The rules that detect redundant assertions and
 * superfluous narrowings require TypeScript type information, so the mirror
 * enables the project service rather than relying on syntax-only parsing.
 */
export const TYPE_AWARE_PARSER_OPTIONS = {
  projectService: true,
} as const;

/**
 * Severity at which the mirrored rules run while the existing backlog is
 * cleared. Warn-first keeps `spx validation lint` green over current findings;
 * each backlog session flips its rules to error as its batch clears.
 */
export const MIRROR_RULE_SEVERITY = "warn" as const;

/**
 * The curated warn-first lint mirror: the type-aware `@typescript-eslint` rules
 * that were dormant without the project service (redundant assertions,
 * superfluous narrowings) plus SonarJS analyzer rules, run locally so findings
 * surface before push. Backlog sessions extend this set and flip rules to
 * error as their batch clears; this starter set establishes the mechanism.
 */
export const MIRROR_RULES: Linter.RulesRecord = {
  "@typescript-eslint/no-unnecessary-type-assertion": MIRROR_RULE_SEVERITY,
  "@typescript-eslint/no-unnecessary-condition": MIRROR_RULE_SEVERITY,
  "sonarjs/cognitive-complexity": MIRROR_RULE_SEVERITY,
  "sonarjs/no-identical-expressions": MIRROR_RULE_SEVERITY,
};
