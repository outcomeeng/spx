import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import {
  ARRAY_SORT_COMPARATOR_RULE,
  MIRROR_ERROR_RULES,
  MIRROR_ERROR_SEVERITY,
  MIRROR_RULES,
  MIRROR_WARN_RULES,
  MIRROR_WARN_SEVERITY,
  TYPE_AWARE_PARSER_OPTIONS,
} from "@eslint-rules/sonarjs-mirror";

describe("type-aware lint mirror", () => {
  const sonarjsPrefix = "sonarjs/";
  const typescriptPrefix = "@typescript-eslint/";
  // Identical operands around `&&` violate a mirrored SonarJS rule
  // (no-identical-expressions; the rule exempts `===`/`!==`, the NaN self-check
  // idiom). The specific rule name stays source-owned in MIRROR_RULES.
  const violatingSource = "const value = true;\nconst flag = value && value;\n";

  const sonarjsMirrorRules = (): Linter.RulesRecord =>
    Object.fromEntries(
      Object.entries(MIRROR_RULES).filter(([name]) => name.startsWith(sonarjsPrefix)),
    );

  it("enables type-aware linting through the project service", () => {
    expect(TYPE_AWARE_PARSER_OPTIONS.projectService).toBe(true);
  });

  // ESLint's numeric severities are an external contract: 1 is a warning
  // (non-blocking), 2 is an error (fails the lint run).
  const eslintWarningSeverity = 1;
  const eslintErrorSeverity = 2;

  // Drives the warn-tier SonarJS rules at a chosen severity and reads back the
  // severity ESLint reports for whichever fires on the violating source, so the
  // probe names no specific rule.
  const reportedSeverityAt = (severity: Linter.RuleSeverity): number | undefined => {
    const rules = Object.fromEntries(
      Object.keys(MIRROR_WARN_RULES)
        .filter((name) => name.startsWith(sonarjsPrefix))
        .map((name) => [name, severity]),
    );
    return new Linter()
      .verify(violatingSource, { plugins: { sonarjs }, rules })
      .find((message) => message.ruleId?.startsWith(sonarjsPrefix))?.severity;
  };

  it("partitions rules into disjoint warn and error tiers whose union is the mirror", () => {
    expect(MIRROR_WARN_SEVERITY).not.toBe(MIRROR_ERROR_SEVERITY);
    expect(
      Object.values(MIRROR_WARN_RULES).every((severity) => severity === MIRROR_WARN_SEVERITY),
    ).toBe(true);
    expect(
      Object.values(MIRROR_ERROR_RULES).every((severity) => severity === MIRROR_ERROR_SEVERITY),
    ).toBe(true);
    const warnNames = Object.keys(MIRROR_WARN_RULES);
    const errorNames = Object.keys(MIRROR_ERROR_RULES);
    expect(warnNames.some((name) => errorNames.includes(name))).toBe(false);
    expect(MIRROR_RULES).toEqual({ ...MIRROR_WARN_RULES, ...MIRROR_ERROR_RULES });
  });

  it("maps the tier severity values to ESLint's blocking and non-blocking levels", () => {
    // Feeds each tier's severity value into ESLint through a syntactic warn-tier
    // rule and reads back the numeric severity ESLint assigns: the error tier's
    // value yields a blocking error (2), the warn tier's a non-blocking warning
    // (1). This pins the severity values, not the type-aware sort rule's firing —
    // that fires only against a real project and is covered by the live
    // `spx validation` gate.
    expect(reportedSeverityAt(MIRROR_WARN_SEVERITY)).toBe(eslintWarningSeverity);
    expect(reportedSeverityAt(MIRROR_ERROR_SEVERITY)).toBe(eslintErrorSeverity);
  });

  it("places the array-sort-comparator class in the error tier", () => {
    // The sort-comparator class (SonarQube S2871) has no remaining occurrence in
    // the linted tree, so it runs at the error tier: a new bare sort fails the gate.
    expect(MIRROR_ERROR_RULES).toHaveProperty(ARRAY_SORT_COMPARATOR_RULE, MIRROR_ERROR_SEVERITY);
  });

  it("mirrors both SonarJS and type-aware @typescript-eslint rules across its tiers", () => {
    const ruleNames = Object.keys(MIRROR_RULES);

    expect(ruleNames.some((rule) => rule.startsWith(sonarjsPrefix))).toBe(true);
    expect(ruleNames.some((rule) => rule.startsWith(typescriptPrefix))).toBe(true);
  });

  it("reports a finding when ESLint runs the mirrored SonarJS rules against violating source", () => {
    const linter = new Linter();
    const messages = linter.verify(violatingSource, {
      plugins: { sonarjs },
      rules: sonarjsMirrorRules(),
    });

    expect(
      messages.some((message) => message.ruleId?.startsWith(sonarjsPrefix)),
    ).toBe(true);
  });

  it("declares mirror rule ids the owning plugins recognize", () => {
    // The type-aware rules — the @typescript-eslint redundancy rules and the
    // SonarJS sort-comparator rule — report only against a real TypeScript
    // project, covered by the buildEslintConfig composition [audit] and the live
    // `spx validation` gate; here the rule ids are confirmed recognized by the
    // plugins that own them.
    const typescriptRuleNames = Object.keys(MIRROR_RULES)
      .filter((rule) => rule.startsWith(typescriptPrefix))
      .map((rule) => rule.slice(typescriptPrefix.length));
    const sonarjsRuleNames = Object.keys(MIRROR_RULES)
      .filter((rule) => rule.startsWith(sonarjsPrefix))
      .map((rule) => rule.slice(sonarjsPrefix.length));

    // The runtime plugin exposes `rules`; the compat plugin type does not.
    const tseslintPluginRules = (tseslint.plugin as { rules?: Record<string, unknown> })
      .rules ?? {};
    const sonarjsPluginRules = (sonarjs as { rules?: Record<string, unknown> }).rules ?? {};

    expect(typescriptRuleNames.length).toBeGreaterThan(0);
    for (const ruleName of typescriptRuleNames) {
      expect(tseslintPluginRules).toHaveProperty(ruleName);
    }
    expect(sonarjsRuleNames.length).toBeGreaterThan(0);
    for (const ruleName of sonarjsRuleNames) {
      expect(sonarjsPluginRules).toHaveProperty(ruleName);
    }
  });
});
