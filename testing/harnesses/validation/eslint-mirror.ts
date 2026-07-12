import { ESLint, Linter } from "eslint";
import importPlugin from "eslint-plugin-import";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";
import { expect } from "vitest";

import { TEST_RELEVANT_SOURCE_ROOT_PREFIX } from "@/config/source-roots";
import { ESLINT_PRODUCTION_CONFIG_FILES } from "@/validation/discovery/language-finder";
import { DEFAULT_ESLINT_CONFIG_FILE } from "@/validation/steps/eslint-contract";
import { SPX_RULE_PREFIX } from "@eslint-rules/import-source";
import customRules from "@eslint-rules/index";
import { NO_TASK_MARKER_COMMENTS_RULE_NAME, TASK_MARKER_COMMENT_TERMS } from "@eslint-rules/no-task-marker-comments";
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
  TASK_MARKER_COMMENT_FALLBACK_FILES,
  TASK_MARKER_COMMENT_RULE,
  TYPE_AWARE_PARSER_OPTIONS,
} from "@eslint-rules/offline-mirror";
import { ESLINT_MIRROR_TEST_GENERATOR } from "@testing/generators/validation/eslint-mirror";

const SONARJS_PREFIX = "sonarjs/";
const TYPESCRIPT_PREFIX = "@typescript-eslint/";
const UNICORN_PREFIX = "unicorn/";
const IMPORT_PREFIX = "import/";
const SPX_PREFIX = SPX_RULE_PREFIX;
const ESLINT_WARNING_SEVERITY = 1;
const ESLINT_ERROR_SEVERITY = 2;
const COGNITIVE_COMPLEXITY_PROBE_THRESHOLD = 0;

interface OfflineErrorRuleProbe {
  readonly select: (rule: string) => boolean;
  readonly violatingSource: string;
}

function isCoreRule(rule: string): boolean {
  return !rule.includes("/");
}

function sonarjsMirrorRules(): Linter.RulesRecord {
  return Object.fromEntries(
    Object.entries(MIRROR_RULES).filter(([name]) => name.startsWith(SONARJS_PREFIX)),
  );
}

function unicornMirrorRuleNames(): string[] {
  return Object.keys(MIRROR_RULES).filter((name) => name.startsWith(UNICORN_PREFIX));
}

function reportedSeverityAt(severity: Linter.RuleSeverity): number | undefined {
  const rules = Object.fromEntries(
    Object.keys(MIRROR_WARN_RULES)
      .filter((name) => name.startsWith(SONARJS_PREFIX))
      .map((name) => [name, severity]),
  );
  return new Linter()
    .verify(ESLINT_MIRROR_TEST_GENERATOR.identicalExpressionSource(), { plugins: { sonarjs }, rules })
    .find((message) => message.ruleId?.startsWith(SONARJS_PREFIX))?.severity;
}

function offlineErrorRuleProbes(): readonly OfflineErrorRuleProbe[] {
  return [
    {
      select: (rule) => isCoreRule(rule),
      violatingSource: ESLINT_MIRROR_TEST_GENERATOR.objectHasOwnSource(),
    },
    {
      select: (rule) => rule.startsWith(IMPORT_PREFIX),
      violatingSource: ESLINT_MIRROR_TEST_GENERATOR.duplicateImportSource(),
    },
  ];
}

function namesUnder(prefix: string): string[] {
  return Object.keys(MIRROR_RULES)
    .filter((rule) => rule.startsWith(prefix))
    .map((rule) => rule.slice(prefix.length));
}

function pluginRulesOf(plugin: unknown): Record<string, unknown> {
  return (plugin as { rules?: Record<string, unknown> }).rules ?? {};
}

function expectAllRecognized(ruleNames: readonly string[], ownerRules: Record<string, unknown>): void {
  expect(ruleNames.length).toBeGreaterThan(0);
  for (const ruleName of ruleNames) {
    expect(ownerRules).toHaveProperty(ruleName);
  }
}

export function assertTypeAwareParserOptions(): void {
  expect(TYPE_AWARE_PARSER_OPTIONS.projectService).toBe(true);
}

export function assertMirrorRuleTiersPartitionMirror(): void {
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
}

export function assertMirrorTierSeveritiesMapToEslintLevels(): void {
  expect(reportedSeverityAt(MIRROR_WARN_SEVERITY)).toBe(ESLINT_WARNING_SEVERITY);
  expect(reportedSeverityAt(MIRROR_ERROR_SEVERITY)).toBe(ESLINT_ERROR_SEVERITY);
}

export function assertClearedFindingClassesRunAtErrorTier(): void {
  expect(MIRROR_ERROR_RULES).toHaveProperty(ARRAY_SORT_COMPARATOR_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(COGNITIVE_COMPLEXITY_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(PSEUDO_RANDOM_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(REDUNDANT_ASSERTION_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(OBJECT_HAS_OWN_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(DUPLICATE_IMPORT_RULE, MIRROR_ERROR_SEVERITY);
  expect(MIRROR_ERROR_RULES).toHaveProperty(TASK_MARKER_COMMENT_RULE, MIRROR_ERROR_SEVERITY);
}

export function assertUnicornRulesRunAtWarnTier(): void {
  const unicornNames = unicornMirrorRuleNames();
  expect(unicornNames.length).toBeGreaterThan(0);
  expect(
    unicornNames.every((name) => MIRROR_WARN_RULES[name] === MIRROR_WARN_SEVERITY),
  ).toBe(true);
  expect(unicornNames.some((name) => name in MIRROR_ERROR_RULES)).toBe(false);
}

export function assertMirroredUnicornRulesReportFindings(): void {
  const linter = new Linter();
  const unicornNames = unicornMirrorRuleNames();
  const unicornViolationFixtures = ESLINT_MIRROR_TEST_GENERATOR.unicornViolationFixtures();

  expect(unicornNames.length).toBeGreaterThan(0);
  for (const ruleId of unicornNames) {
    const shortName = ruleId.slice(UNICORN_PREFIX.length);
    const source = unicornViolationFixtures[shortName];
    expect(source, `missing violating fixture for ${ruleId}`).toBeDefined();

    const messages = linter.verify(source, {
      plugins: { unicorn },
      rules: { [ruleId]: MIRROR_WARN_SEVERITY },
    });

    expect(messages.some((message) => message.ruleId === ruleId)).toBe(true);
  }
}

export function assertMirrorDrawsRulesFromExpectedSources(): void {
  const ruleNames = Object.keys(MIRROR_RULES);

  expect(ruleNames.some((rule) => rule.startsWith(SONARJS_PREFIX))).toBe(true);
  expect(ruleNames.some((rule) => rule.startsWith(TYPESCRIPT_PREFIX))).toBe(true);
  expect(ruleNames.some((rule) => rule.startsWith(UNICORN_PREFIX))).toBe(true);
  expect(ruleNames.some((rule) => rule.startsWith(IMPORT_PREFIX))).toBe(true);
  expect(ruleNames.some((rule) => rule.startsWith(SPX_PREFIX))).toBe(true);
  expect(ruleNames.some(isCoreRule)).toBe(true);
}

export function assertMirroredSonarjsRulesReportFinding(): void {
  const linter = new Linter();
  const messages = linter.verify(ESLINT_MIRROR_TEST_GENERATOR.identicalExpressionSource(), {
    plugins: { sonarjs },
    rules: sonarjsMirrorRules(),
  });

  expect(
    messages.some((message) => message.ruleId?.startsWith(SONARJS_PREFIX)),
  ).toBe(true);
}

export function assertPseudoRandomGuardReportsFinding(): void {
  const linter = new Linter();
  const messages = linter.verify(ESLINT_MIRROR_TEST_GENERATOR.pseudoRandomSource(), {
    plugins: { sonarjs },
    rules: { [PSEUDO_RANDOM_RULE]: MIRROR_ERROR_SEVERITY },
  });

  expect(messages.some((message) => message.ruleId === PSEUDO_RANDOM_RULE)).toBe(true);
}

export function assertCognitiveComplexityGuardReportsFinding(): void {
  const linter = new Linter();
  const messages = linter.verify(
    ESLINT_MIRROR_TEST_GENERATOR.cognitiveComplexitySource(),
    {
      plugins: { sonarjs },
      rules: { [COGNITIVE_COMPLEXITY_RULE]: [MIRROR_ERROR_SEVERITY, COGNITIVE_COMPLEXITY_PROBE_THRESHOLD] },
    },
  );

  expect(messages.some((message) => message.ruleId === COGNITIVE_COMPLEXITY_RULE)).toBe(true);
}

export function assertOfflineErrorTierRulesReportFindings(): void {
  const linter = new Linter();
  for (const probe of offlineErrorRuleProbes()) {
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
}

export function assertTaskMarkerCommentsReportFindings(): void {
  const linter = new Linter();
  for (const marker of TASK_MARKER_COMMENT_TERMS) {
    const violatingMessages = linter.verify(ESLINT_MIRROR_TEST_GENERATOR.taskMarkerCommentSource(marker), {
      plugins: { spx: customRules },
      rules: { [TASK_MARKER_COMMENT_RULE]: MIRROR_ERROR_SEVERITY },
    });

    expect(violatingMessages.some((message) => message.ruleId === TASK_MARKER_COMMENT_RULE)).toBe(true);
  }

  const domainVocabularyMessages = linter.verify(
    ESLINT_MIRROR_TEST_GENERATOR.domainVocabularySource(),
    {
      plugins: { spx: customRules },
      rules: { [TASK_MARKER_COMMENT_RULE]: MIRROR_ERROR_SEVERITY },
    },
  );

  expect(domainVocabularyMessages).toEqual([]);
}

export async function assertTaskMarkerFallbackConfigReportsFindings(): Promise<void> {
  const eslint = new ESLint({
    overrideConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  });
  const [eslintRuleFileGlob, rootTypeScriptConfigGlob, productionTypeScriptConfigGlob] =
    TASK_MARKER_COMMENT_FALLBACK_FILES;
  const [productionEslintConfigFile] = ESLINT_PRODUCTION_CONFIG_FILES;
  const fallbackCases = [
    {
      glob: eslintRuleFileGlob,
      filename: `${TEST_RELEVANT_SOURCE_ROOT_PREFIX.ESLINT_RULES}${NO_TASK_MARKER_COMMENTS_RULE_NAME}.ts`,
    },
    {
      glob: rootTypeScriptConfigGlob,
      filename: DEFAULT_ESLINT_CONFIG_FILE,
    },
    {
      glob: productionTypeScriptConfigGlob,
      filename: productionEslintConfigFile,
    },
  ];
  expect(fallbackCases.map((fallbackCase) => fallbackCase.glob)).toEqual([...TASK_MARKER_COMMENT_FALLBACK_FILES]);
  for (const fallbackCase of fallbackCases) {
    const [result] = await eslint.lintText(
      ESLINT_MIRROR_TEST_GENERATOR.taskMarkerCommentSource(TASK_MARKER_COMMENT_TERMS[0]),
      { filePath: fallbackCase.filename },
    );

    expect(result.messages.some((message) => message.ruleId === TASK_MARKER_COMMENT_RULE)).toBe(true);
  }
}

export function assertMirrorRuleIdsAreRecognizedByOwners(): void {
  expectAllRecognized(namesUnder(TYPESCRIPT_PREFIX), pluginRulesOf(tseslint.plugin));
  expectAllRecognized(namesUnder(SONARJS_PREFIX), pluginRulesOf(sonarjs));
  expectAllRecognized(namesUnder(IMPORT_PREFIX), pluginRulesOf(importPlugin));
  expectAllRecognized(namesUnder(UNICORN_PREFIX), pluginRulesOf(unicorn));
  expectAllRecognized(namesUnder(SPX_PREFIX), pluginRulesOf(customRules));

  const coreRuleNames = Object.keys(MIRROR_RULES).filter(isCoreRule);
  expect(coreRuleNames.length).toBeGreaterThan(0);
  for (const ruleName of coreRuleNames) {
    expect(builtinRules.has(ruleName)).toBe(true);
  }
}
