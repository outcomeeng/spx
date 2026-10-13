import { SPEC_TREE_CONFIG, type SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";
import {
  distinctOrderedDirectoryName,
  orderedDirectoryName,
  SPEC_TREE_SOURCE_LINES,
  specTreeGrammarSelectionForLine,
  supersededSuffixOracle,
} from "@testing/generators/spec-tree/spec-tree";

const LINT_POLICY_TEST_BRANCH = "spec-tree-node-branch";
const OUTER_REPO_BRANCH = "outer-main";
const OUTER_REPO_USER_NAME = "Outer Repo User";
const OUTER_REPO_USER_EMAIL = "outer@test.local";
const JSON_OBJECT_ERROR_FRAGMENT = "must contain a JSON object";
const LINT_POLICY_TEST_PRODUCT_DIR_ENV = "SPX_LINT_POLICY_TEST_PRODUCT_DIR";
const BASE_COMMIT_MESSAGE = "base manifests";
const ADDED_DEBT_COMMIT_MESSAGE = "add manifest debt";
const BASELINE_ABSENT_COMMIT_MESSAGE = "manifests without baseline branch";
const OUTER_SENTINEL_COMMIT_MESSAGE = "outer sentinel";
const CORRUPT_BASELINE_COMMIT_MESSAGE = "corrupt baseline manifest";
const CONFIG_LOAD_SUCCESS_MARKER = "eslint-config-loaded";

export interface ValidationLintPolicyManifestEntries {
  readonly testLintDebtNodes: readonly string[];
  readonly testOwnedConstantDebtNodes?: readonly string[];
}

export const VALIDATION_LINT_POLICY_DATA = {
  manifests: LINT_POLICY_MANIFESTS,
  baseRefs: LINT_POLICY_BASE_REFS,
  testBranch: LINT_POLICY_TEST_BRANCH,
  outerRepoBranch: OUTER_REPO_BRANCH,
  outerRepoUserName: OUTER_REPO_USER_NAME,
  outerRepoUserEmail: OUTER_REPO_USER_EMAIL,
  jsonObjectErrorFragment: JSON_OBJECT_ERROR_FRAGMENT,
  configLoadSuccessMarker: CONFIG_LOAD_SUCCESS_MARKER,
  productDirEnvironmentKey: LINT_POLICY_TEST_PRODUCT_DIR_ENV,
  commitMessages: {
    base: BASE_COMMIT_MESSAGE,
    addedDebt: ADDED_DEBT_COMMIT_MESSAGE,
    baselineAbsent: BASELINE_ABSENT_COMMIT_MESSAGE,
    outerSentinel: OUTER_SENTINEL_COMMIT_MESSAGE,
    corruptBaseline: CORRUPT_BASELINE_COMMIT_MESSAGE,
  },
} as const;

/** A node directory the lint policy judges under the declaration on `line`. */
export type LintPolicySuffixCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  readonly directory: string;
};

/** One directory per node suffix a naming-schema version a line selects accepts. */
export function lintPolicyAcceptedSuffixCases(): readonly LintPolicySuffixCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) =>
    specTreeGrammarSelectionForLine(line).selected.flatMap((version) => version.nodeSuffixes).map((suffix) => ({
      line,
      suffix,
    }))
  ).map(({ line, suffix }, drawIndex) => ({
    title: `accepts a ${suffix} directory under a ${line} declaration`,
    line,
    directory: orderedDirectoryName(suffix, drawIndex),
  }));
}

/** One directory per node suffix the independent oracle leaves to a version ordered before the line's target. */
export function lintPolicyRejectedSuffixCases(): readonly LintPolicySuffixCase[] {
  return SPEC_TREE_SOURCE_LINES.flatMap((line) =>
    supersededSuffixOracle(specTreeGrammarSelectionForLine(line)).map(({ suffix }) => ({ line, suffix }))
  ).map(({ line, suffix }, drawIndex) => ({
    title: `rejects a ${suffix} directory under a ${line} declaration, naming the directory`,
    line,
    directory: orderedDirectoryName(suffix, drawIndex),
  }));
}

/** The node directories a lint-debt manifest case holds under one methodology declaration. */
export type LintPolicyDebtCase = {
  readonly title: string;
  readonly line: SpecTreeMethodologyLine;
  /** The baseline debt node, relative to the product root. */
  readonly baseDebtPath: string;
  /** The node a branch adds to the manifest, relative to the product root. */
  readonly addedDebtPath: string;
};

/** One manifest case per selected methodology line; its nodes carry a suffix the line's selection accepts. */
export function lintPolicyDebtCases(): readonly LintPolicyDebtCase[] {
  return SPEC_TREE_SOURCE_LINES.map((line) => {
    const suffix = specTreeGrammarSelectionForLine(line).selected.flatMap((version) => version.nodeSuffixes).at(0);
    if (suffix === undefined) throw new Error(`No node suffix is selected under a ${line} declaration`);
    const baseDirectory = orderedDirectoryName(suffix);
    const addedDirectory = distinctOrderedDirectoryName(suffix, new Set([baseDirectory]));
    return {
      title: `under a ${line} declaration`,
      line,
      baseDebtPath: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${baseDirectory}`,
      addedDebtPath: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${addedDirectory}`,
    };
  });
}

/** A node directory of a product whose configuration carries no methodology declaration. */
export type LintPolicyUndeclaredCase = {
  readonly title: string;
  readonly directory: string;
};

/** One directory per node suffix any selected naming-schema version accepts. */
export function lintPolicyUndeclaredTreeCases(): readonly LintPolicyUndeclaredCase[] {
  const suffixes = new Set(
    SPEC_TREE_SOURCE_LINES.flatMap((line) =>
      specTreeGrammarSelectionForLine(line).selected.flatMap((version) => version.nodeSuffixes)
    ),
  );
  return [...suffixes].map((suffix, drawIndex) => ({
    title: `rejects an undeclared product holding a ${suffix} directory`,
    directory: orderedDirectoryName(suffix, drawIndex),
  }));
}
