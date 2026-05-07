import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";

const LINT_POLICY_TEMP_PREFIX = "spx-lint-policy-";
const BASE_LEGACY_PATH = "spx/10-old.story";
const BASE_TEST_DEBT_PATH = "spx/20-current.enabler";
const ADDED_TEST_DEBT_PATH = "spx/30-added.enabler";
const LINT_POLICY_TEST_BRANCH = `${WORK_ITEM_KINDS[1]}-branch`;
const OUTER_REPO_BRANCH = "outer-main";
const OUTER_REPO_USER_NAME = "Outer Repo User";
const OUTER_REPO_USER_EMAIL = "outer@test.local";
const JSON_OBJECT_ERROR_FRAGMENT = "must contain a JSON object";
const LINT_POLICY_TEST_PROJECT_ROOT_ENV = "SPX_LINT_POLICY_TEST_PROJECT_ROOT";
const BASE_COMMIT_MESSAGE = "base manifests";
const ADDED_DEBT_COMMIT_MESSAGE = "add manifest debt";
const BASELINE_ABSENT_COMMIT_MESSAGE = "manifests without baseline branch";
const OUTER_SENTINEL_COMMIT_MESSAGE = "outer sentinel";
const CORRUPT_BASELINE_COMMIT_MESSAGE = "corrupt baseline manifest";

export const VALIDATION_LINT_POLICY_SCENARIO_KIND = {
  UNRELATED_PROJECT: "unrelatedProject",
  EXISTING_DEBT: "existingDebt",
  BRANCH_ADDITION: "branchAddition",
  BASELINE_ABSENT: "baselineAbsent",
  HOOK_GIT_VARIABLES: "hookGitVariables",
  CORRUPT_BASELINE: "corruptBaseline",
  MISSING_LEGACY_MANIFEST_ENTRY: "missingLegacyManifestEntry",
} as const;

export type ValidationLintPolicyScenarioKind =
  (typeof VALIDATION_LINT_POLICY_SCENARIO_KIND)[keyof typeof VALIDATION_LINT_POLICY_SCENARIO_KIND];

export interface ValidationLintPolicyScenario {
  readonly title: string;
  readonly kind: ValidationLintPolicyScenarioKind;
}

export interface ValidationLintPolicyManifestEntries {
  readonly legacySpecSuffixNodes: readonly string[];
  readonly testLintDebtNodes: readonly string[];
  readonly testOwnedConstantDebtNodes?: readonly string[];
}

export const VALIDATION_LINT_POLICY_DATA = {
  tempPrefix: LINT_POLICY_TEMP_PREFIX,
  manifests: LINT_POLICY_MANIFESTS,
  baseRefs: LINT_POLICY_BASE_REFS,
  baseLegacyPath: BASE_LEGACY_PATH,
  baseTestDebtPath: BASE_TEST_DEBT_PATH,
  addedTestDebtPath: ADDED_TEST_DEBT_PATH,
  testBranch: LINT_POLICY_TEST_BRANCH,
  outerRepoBranch: OUTER_REPO_BRANCH,
  outerRepoUserName: OUTER_REPO_USER_NAME,
  outerRepoUserEmail: OUTER_REPO_USER_EMAIL,
  jsonObjectErrorFragment: JSON_OBJECT_ERROR_FRAGMENT,
  projectRootEnvironmentKey: LINT_POLICY_TEST_PROJECT_ROOT_ENV,
  commitMessages: {
    base: BASE_COMMIT_MESSAGE,
    addedDebt: ADDED_DEBT_COMMIT_MESSAGE,
    baselineAbsent: BASELINE_ABSENT_COMMIT_MESSAGE,
    outerSentinel: OUTER_SENTINEL_COMMIT_MESSAGE,
    corruptBaseline: CORRUPT_BASELINE_COMMIT_MESSAGE,
  },
} as const;

export function validationLintPolicyScenarios(): ValidationLintPolicyScenario[] {
  return [
    {
      title: "unrelated TypeScript projects do not require repository policy manifests",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.UNRELATED_PROJECT,
    },
    {
      title: "existing repository debt manifests are accepted without git metadata",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.EXISTING_DEBT,
    },
    {
      title: "manifest additions on a branch are rejected when absent from the base branch",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.BRANCH_ADDITION,
    },
    {
      title: "shrink-only comparison is skipped when no baseline exists",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.BASELINE_ABSENT,
    },
    {
      title: "nested fixture Git commands stay inside the fixture when hook Git variables are present",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.HOOK_GIT_VARIABLES,
    },
    {
      title: "corrupt baseline manifests are rejected",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.CORRUPT_BASELINE,
    },
    {
      title: "legacy suffix nodes in the tree must be present in the manifest",
      kind: VALIDATION_LINT_POLICY_SCENARIO_KIND.MISSING_LEGACY_MANIFEST_ENTRY,
    },
  ];
}
