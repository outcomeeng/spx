import {
  assertClearedFindingClassesRunAtErrorTier,
  assertCognitiveComplexityGuardReportsFinding,
  assertMirrorDrawsRulesFromExpectedSources,
  assertMirroredSonarjsRulesReportFinding,
  assertMirroredUnicornRulesReportFindings,
  assertMirrorRuleIdsAreRecognizedByOwners,
  assertMirrorRuleTiersPartitionMirror,
  assertMirrorTierSeveritiesMapToEslintLevels,
  assertOfflineErrorTierRulesReportFindings,
  assertPseudoRandomGuardReportsFinding,
  assertTaskMarkerCommentsReportFindings,
  assertTaskMarkerFallbackConfigReportsFindings,
  assertTypeAwareParserOptions,
  assertUnicornRulesRunAtWarnTier,
} from "@testing/harnesses/validation/eslint-mirror";
import { describe, expect, it } from "vitest";

describe("type-aware lint mirror", () => {
  it("enables type-aware linting through the project service", () => {
    assertTypeAwareParserOptions();
  });

  it("partitions rules into disjoint warn and error tiers whose union is the mirror", () => {
    assertMirrorRuleTiersPartitionMirror();
  });

  it("maps the tier severity values to ESLint's blocking and non-blocking levels", () => {
    assertMirrorTierSeveritiesMapToEslintLevels();
  });

  it("places the cleared classes in the error tier", () => {
    assertClearedFindingClassesRunAtErrorTier();
  });

  it("places the unicorn-family rules in the warn tier", () => {
    assertUnicornRulesRunAtWarnTier();
  });

  it("reports a finding when ESLint runs each mirrored unicorn rule against violating source", () => {
    assertMirroredUnicornRulesReportFindings();
  });

  it("draws rules from sonarjs, @typescript-eslint, ESLint core, eslint-plugin-import, unicorn, and spx across its tiers", () => {
    assertMirrorDrawsRulesFromExpectedSources();
  });

  it("reports a finding when ESLint runs the mirrored SonarJS rules against violating source", () => {
    assertMirroredSonarjsRulesReportFinding();
  });

  it("reports a finding when ESLint runs the PRNG recurrence guard against Math.random", () => {
    assertPseudoRandomGuardReportsFinding();
  });

  it("reports a finding when ESLint runs the cognitive-complexity recurrence guard", () => {
    assertCognitiveComplexityGuardReportsFinding();
  });

  it("reports a finding when ESLint runs each offline-testable error-tier rule against violating source", () => {
    assertOfflineErrorTierRulesReportFindings();
  });

  it("reports each uppercase task-marker comment while allowing lower-case session vocabulary", () => {
    assertTaskMarkerCommentsReportFindings();
  });

  it("reports task-marker comments in root TypeScript config files through the fallback config", async () => {
    await expect(assertTaskMarkerFallbackConfigReportsFindings()).resolves.toBeUndefined();
  });

  it("declares mirror rule ids the owning plugins recognize", () => {
    assertMirrorRuleIdsAreRecognizedByOwners();
  });
});
