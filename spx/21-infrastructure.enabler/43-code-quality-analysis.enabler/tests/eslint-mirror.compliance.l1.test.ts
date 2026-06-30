import { Linter } from "eslint";
import importPlugin from "eslint-plugin-import";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import {
  ARRAY_SORT_COMPARATOR_RULE,
  COGNITIVE_COMPLEXITY_RULE,
  DUPLICATE_IMPORT_RULE,
  MIRROR_ERROR_RULES,
  MIRROR_ERROR_SEVERITY,
  MIRROR_RULES,
  MIRROR_WARN_RULES,
  MIRROR_WARN_SEVERITY,
  OBJECT_HAS_OWN_RULE,
  PSEUDO_RANDOM_RULE,
  REDUNDANT_ASSERTION_RULE,
  TYPE_AWARE_PARSER_OPTIONS,
} from "@eslint-rules/offline-mirror";

describe("type-aware lint mirror", () => {
  const sonarjsPrefix = "sonarjs/";
  const typescriptPrefix = "@typescript-eslint/";
  const unicornPrefix = "unicorn/";
  const importPrefix = "import/";
  // ESLint core rules carry no plugin prefix (no `/` in the rule id).
  const isCoreRule = (rule: string): boolean => !rule.includes("/");
  // Identical operands around `&&` violate a mirrored SonarJS rule
  // (no-identical-expressions; the rule exempts `===`/`!==`, the NaN self-check
  // idiom). The specific rule name stays source-owned in MIRROR_RULES.
  const violatingSource = "const value = true;\nconst flag = value && value;\n";

  const sonarjsMirrorRules = (): Linter.RulesRecord =>
    Object.fromEntries(
      Object.entries(MIRROR_RULES).filter(([name]) => name.startsWith(sonarjsPrefix)),
    );

  // One violating fixture per mirrored unicorn rule, keyed by the rule's short
  // name. The full `unicorn/...` id stays source-owned in MIRROR_RULES; the test
  // reads that source-owned set and looks up each rule's fixture here.
  const unicornViolationFixtures: Record<string, string> = {
    "prefer-node-protocol": "import { readFileSync } from \"fs\";\nreadFileSync;\n",
    "prefer-code-point": "const code = \"a\".charCodeAt(0);\ncode;\n",
    "prefer-single-call": "const list = [];\nlist.push(1);\nlist.push(2);\n",
    "prefer-string-raw": "const pattern = \"a\\\\b\";\npattern;\n",
  };

  const unicornMirrorRuleNames = (): string[] =>
    Object.keys(MIRROR_RULES).filter((name) => name.startsWith(unicornPrefix));

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

  it("places the cleared classes in the error tier", () => {
    // The cleared finding classes have no remaining occurrence in the linted
    // tree, so each runs at the error tier: a new occurrence fails the gate.
    // Each graduated class is named through a source-owned constant, so no
    // rule-id literal is duplicated from source.
    expect(MIRROR_ERROR_RULES).toHaveProperty(ARRAY_SORT_COMPARATOR_RULE, MIRROR_ERROR_SEVERITY);
    expect(MIRROR_ERROR_RULES).toHaveProperty(COGNITIVE_COMPLEXITY_RULE, MIRROR_ERROR_SEVERITY);
    expect(MIRROR_ERROR_RULES).toHaveProperty(PSEUDO_RANDOM_RULE, MIRROR_ERROR_SEVERITY);
    expect(MIRROR_ERROR_RULES).toHaveProperty(REDUNDANT_ASSERTION_RULE, MIRROR_ERROR_SEVERITY);
    expect(MIRROR_ERROR_RULES).toHaveProperty(OBJECT_HAS_OWN_RULE, MIRROR_ERROR_SEVERITY);
    expect(MIRROR_ERROR_RULES).toHaveProperty(DUPLICATE_IMPORT_RULE, MIRROR_ERROR_SEVERITY);
  });

  it("places the unicorn-family rules in the warn tier", () => {
    // The unicorn-family modernization backlog is uncleared, so each rule runs at
    // the warn tier — findings surface without failing the gate — and graduates to
    // the error tier in the change that clears its last occurrence.
    const unicornNames = unicornMirrorRuleNames();
    expect(unicornNames.length).toBeGreaterThan(0);
    expect(
      unicornNames.every((name) => MIRROR_WARN_RULES[name] === MIRROR_WARN_SEVERITY),
    ).toBe(true);
    expect(unicornNames.some((name) => name in MIRROR_ERROR_RULES)).toBe(false);
  });

  it("reports a finding when ESLint runs each mirrored unicorn rule against violating source", () => {
    const linter = new Linter();
    const unicornNames = unicornMirrorRuleNames();

    expect(unicornNames.length).toBeGreaterThan(0);
    for (const ruleId of unicornNames) {
      const shortName = ruleId.slice(unicornPrefix.length);
      const source = unicornViolationFixtures[shortName];
      expect(source, `missing violating fixture for ${ruleId}`).toBeDefined();

      const messages = linter.verify(source, {
        plugins: { unicorn },
        rules: { [ruleId]: MIRROR_WARN_SEVERITY },
      });

      expect(messages.some((message) => message.ruleId === ruleId)).toBe(true);
    }
  });

  it("draws rules from sonarjs, @typescript-eslint, ESLint core, eslint-plugin-import, and unicorn across its tiers", () => {
    const ruleNames = Object.keys(MIRROR_RULES);

    expect(ruleNames.some((rule) => rule.startsWith(sonarjsPrefix))).toBe(true);
    expect(ruleNames.some((rule) => rule.startsWith(typescriptPrefix))).toBe(true);
    expect(ruleNames.some((rule) => rule.startsWith(unicornPrefix))).toBe(true);
    expect(ruleNames.some((rule) => rule.startsWith(importPrefix))).toBe(true);
    expect(ruleNames.some(isCoreRule)).toBe(true);
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

  it("reports a finding when ESLint runs the PRNG recurrence guard against Math.random", () => {
    const linter = new Linter();
    const messages = linter.verify("const token = Math.random();\ntoken;\n", {
      plugins: { sonarjs },
      rules: { [PSEUDO_RANDOM_RULE]: MIRROR_ERROR_SEVERITY },
    });

    expect(messages.some((message) => message.ruleId === PSEUDO_RANDOM_RULE)).toBe(true);
  });

  it("reports a finding when ESLint runs the cognitive-complexity recurrence guard", () => {
    const linter = new Linter();
    const cognitiveComplexityProbeThreshold = 0;
    const messages = linter.verify(
      "function choose(flag) {\nif (flag) {\nreturn 1;\n}\nreturn 0;\n}\nchoose(true);\n",
      {
        plugins: { sonarjs },
        rules: { [COGNITIVE_COMPLEXITY_RULE]: [MIRROR_ERROR_SEVERITY, cognitiveComplexityProbeThreshold] },
      },
    );

    expect(messages.some((message) => message.ruleId === COGNITIVE_COMPLEXITY_RULE)).toBe(true);
  });

  // The non-type-aware error-tier rules paired with violating source. Each rule
  // id is read from the source-owned MIRROR_ERROR_RULES via its selector, so no
  // rule-id literal is duplicated from source; only the violating fixture — kept
  // to short module names and identifiers, never a flaggable string literal — is
  // test input. The type-aware error-tier rules (S2871 sort, S4325 assertion)
  // fire only against a real project, covered by the buildEslintConfig
  // composition [audit] and the live `spx validation` gate.
  const offlineErrorRuleProbes: { select: (rule: string) => boolean; violatingSource: string }[] = [
    {
      // S6653 prefer Object.hasOwn — an ESLint core rule (no plugin prefix).
      select: (rule) => isCoreRule(rule),
      violatingSource: "const obj = {};\nObject.prototype.hasOwnProperty.call(obj, \"k\");\n",
    },
    {
      // S3863 merge duplicate imports — eslint-plugin-import.
      select: (rule) => rule.startsWith(importPrefix),
      violatingSource:
        "import { readFileSync } from \"fs\";\nimport { writeFileSync } from \"fs\";\nreadFileSync;\nwriteFileSync;\n",
    },
  ];

  it("reports a finding when ESLint runs each offline-testable error-tier rule against violating source", () => {
    const linter = new Linter();
    for (const probe of offlineErrorRuleProbes) {
      const ruleId = Object.keys(MIRROR_ERROR_RULES).find(probe.select);
      expect(ruleId, "no error-tier rule matched the probe selector").toBeDefined();

      const messages = linter.verify(probe.violatingSource, {
        plugins: { import: importPlugin },
        rules: { [ruleId!]: MIRROR_ERROR_SEVERITY },
      });

      expect(
        messages.some((message) => message.ruleId === ruleId),
        `error-tier rule ${ruleId} did not fire on its violating fixture`,
      ).toBe(true);
    }
  });

  it("declares mirror rule ids the owning plugins recognize", () => {
    // Type-aware rules report only against a real TypeScript project, covered by
    // the buildEslintConfig composition [audit] and the live `spx validation`
    // gate; here every rule id is confirmed recognized by the plugin (or ESLint
    // core) that owns it, so a typo cannot silently disable a mirrored rule.
    const namesUnder = (prefix: string): string[] =>
      Object.keys(MIRROR_RULES)
        .filter((rule) => rule.startsWith(prefix))
        .map((rule) => rule.slice(prefix.length));

    // The runtime plugins expose `rules`; the compat plugin types do not.
    const pluginRulesOf = (plugin: unknown): Record<string, unknown> =>
      (plugin as { rules?: Record<string, unknown> }).rules ?? {};

    const expectAllRecognized = (ruleNames: string[], ownerRules: Record<string, unknown>): void => {
      expect(ruleNames.length).toBeGreaterThan(0);
      for (const ruleName of ruleNames) {
        expect(ownerRules).toHaveProperty(ruleName);
      }
    };

    expectAllRecognized(namesUnder(typescriptPrefix), pluginRulesOf(tseslint.plugin));
    expectAllRecognized(namesUnder(sonarjsPrefix), pluginRulesOf(sonarjs));
    expectAllRecognized(namesUnder(importPrefix), pluginRulesOf(importPlugin));
    expectAllRecognized(namesUnder(unicornPrefix), pluginRulesOf(unicorn));

    // ESLint core rules carry no plugin prefix; the builtin rule map owns them.
    const coreRuleNames = Object.keys(MIRROR_RULES).filter(isCoreRule);
    expect(coreRuleNames.length).toBeGreaterThan(0);
    for (const ruleName of coreRuleNames) {
      expect(builtinRules.has(ruleName)).toBe(true);
    }
  });
});
