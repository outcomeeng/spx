import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import { MIRROR_RULE_SEVERITY, MIRROR_RULES, TYPE_AWARE_PARSER_OPTIONS } from "@eslint-rules/sonarjs-mirror";

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

  it("mirrors both SonarJS and type-aware @typescript-eslint rules at the mirror severity", () => {
    const ruleNames = Object.keys(MIRROR_RULES);

    expect(ruleNames.some((rule) => rule.startsWith(sonarjsPrefix))).toBe(true);
    expect(ruleNames.some((rule) => rule.startsWith(typescriptPrefix))).toBe(true);
    expect(
      Object.values(MIRROR_RULES).every(
        (severity) => severity === MIRROR_RULE_SEVERITY,
      ),
    ).toBe(true);
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

  it("declares @typescript-eslint rule ids the plugin recognizes", () => {
    // Reporting evidence for the type-aware @typescript-eslint rules needs a
    // real TypeScript project, covered by the buildEslintConfig composition
    // [audit]; here the rule ids are confirmed recognized by the plugin.
    const typescriptRuleNames = Object.keys(MIRROR_RULES)
      .filter((rule) => rule.startsWith(typescriptPrefix))
      .map((rule) => rule.slice(typescriptPrefix.length));

    // The runtime plugin exposes `rules`; the compat plugin type does not.
    const pluginRules = (tseslint.plugin as { rules?: Record<string, unknown> })
      .rules ?? {};

    expect(typescriptRuleNames.length).toBeGreaterThan(0);
    for (const ruleName of typescriptRuleNames) {
      expect(pluginRules).toHaveProperty(ruleName);
    }
  });
});
