import * as fc from "fast-check";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  REVIEW_TERMINAL_STATUSES,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { VERIFY_CLI } from "@/interfaces/cli/verify";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";

/**
 * One repository layout for listing a Change's verification runs: the Change whose runs are
 * listed, a distinct Change, an identity that extends the first Change's issue number and so
 * names a different Change sharing its prefix, the branches and linked-worktree branch runs are
 * started on, the name a branch is renamed to, and a product-relative file a file-scoped run
 * verifies.
 */
export interface ChangeRunsScenario {
  readonly change: string;
  readonly otherChange: string;
  readonly prefixSharingChange: string;
  readonly firstBranch: string;
  readonly secondBranch: string;
  readonly worktreeBranch: string;
  readonly renamedBranch: string;
  readonly worktreeDirectory: string;
  readonly filePath: string;
}

const BRANCH_NAME_MAX_TAIL_LENGTH = 16;
const BRANCH_NAME_FIRST_CHARACTERS = "abcdefghijklmnopqrstuvwxyz";
const BRANCH_NAME_CHARACTERS = `${BRANCH_NAME_FIRST_CHARACTERS}0123456789-`;
const BRANCH_NAMES_IN_SCENARIO = 5;
/** A digit appended to a Change identity's issue number yields another canonical Change identity. */
const ISSUE_NUMBER_EXTENSION_DIGITS = "0123456789";

/** A git branch or directory name: a leading lower-case letter followed by letters, digits, or `-`. */
function arbitraryBranchName(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...BRANCH_NAME_FIRST_CHARACTERS),
      fc.array(fc.constantFrom(...BRANCH_NAME_CHARACTERS), { maxLength: BRANCH_NAME_MAX_TAIL_LENGTH }),
    )
    .map(([first, rest]) => `${first}${rest.join("")}`);
}

export function arbitraryChangeRunsScenario(): fc.Arbitrary<ChangeRunsScenario> {
  return fc
    .record({
      changes: fc.uniqueArray(VERIFY_TEST_GENERATOR.changeIdentity(), { minLength: 2, maxLength: 2 }),
      extensionDigit: fc.constantFrom(...ISSUE_NUMBER_EXTENSION_DIGITS),
      names: fc.uniqueArray(arbitraryBranchName(), {
        minLength: BRANCH_NAMES_IN_SCENARIO,
        maxLength: BRANCH_NAMES_IN_SCENARIO,
      }),
      filePath: arbitrarySourceFilePath(),
    })
    .filter(({ changes, extensionDigit }) => `${changes[0]}${extensionDigit}` !== changes[1])
    .map(({ changes, extensionDigit, names, filePath }) => ({
      change: changes[0] ?? "",
      otherChange: changes[1] ?? "",
      prefixSharingChange: `${changes[0]}${extensionDigit}`,
      firstBranch: names[0] ?? "",
      secondBranch: names[1] ?? "",
      worktreeBranch: names[2] ?? "",
      renamedBranch: names[3] ?? "",
      worktreeDirectory: names[4] ?? "",
      filePath,
    }));
}

/**
 * For every verification type, a terminal status `finish` seals a run of that type with when the run
 * carries no scope or finding evidence: any status of the review vocabulary for a review run, which
 * no evidence constrains; `rejected` for an audit run, because an audit that recorded no scope unit
 * covered nothing; and any status of the deterministic runner vocabulary for a test run, whose
 * evidence-free run records no failure.
 */
export function arbitraryEvidenceFreeTerminalStatuses(): fc.Arbitrary<
  Readonly<Record<VerifyVerificationType, string>>
> {
  return fc.record(
    {
      [VERIFY_VERIFICATION_TYPE.REVIEW]: fc.constantFrom(...REVIEW_TERMINAL_STATUSES),
      [VERIFY_VERIFICATION_TYPE.AUDIT]: fc.constant(JOURNAL_RUN_STATE_STATUS.REJECTED),
      [VERIFY_VERIFICATION_TYPE.TEST]: fc.constantFrom(...Object.values(JOURNAL_RUN_TERMINAL_STATUS)),
    } satisfies Record<VerifyVerificationType, fc.Arbitrary<string>>,
  );
}

/** A file a run comparison commits: its product-relative path and the content written there. */
export interface RunComparisonFile {
  readonly path: string;
  readonly content: string;
}

/**
 * One layout for comparing two runs of a Change by the content of the files both judged: the files
 * a first commit adds — every path both runs judge, one path only the first run judges, and one path
 * only the second run judges — the path among those both runs judge whose content a second commit
 * revises, that revision, and the judged paths each run records, each run's in its own drawn order.
 */
export interface RunComparisonScenario {
  readonly commonPaths: readonly string[];
  readonly firstOnlyPath: string;
  readonly secondOnlyPath: string;
  readonly changedPath: string;
  readonly files: readonly RunComparisonFile[];
  readonly revision: RunComparisonFile;
  readonly firstJudgedPaths: readonly string[];
  readonly secondJudgedPaths: readonly string[];
}

/** Both runs judge at least two paths, so the revised path sits beside at least one unrevised one. */
const RUN_COMPARISON_COMMON_PATHS_MIN = 2;
const RUN_COMPARISON_COMMON_PATHS_MAX = 4;
/** Beside the common paths, each run judges one path the other does not. */
const RUN_COMPARISON_SINGLE_RUN_PATHS = 2;

/** Every arrangement of `paths`, so a run records its judged paths in an order drawn independently of the other's. */
function arbitraryJudgedOrder(paths: readonly string[]): fc.Arbitrary<readonly string[]> {
  return fc.shuffledSubarray([...paths], { minLength: paths.length, maxLength: paths.length });
}

export function arbitraryRunComparisonScenario(): fc.Arbitrary<RunComparisonScenario> {
  return fc
    .uniqueArray(arbitrarySourceFilePath(), {
      minLength: RUN_COMPARISON_COMMON_PATHS_MIN + RUN_COMPARISON_SINGLE_RUN_PATHS,
      maxLength: RUN_COMPARISON_COMMON_PATHS_MAX + RUN_COMPARISON_SINGLE_RUN_PATHS,
    })
    .chain((paths) => {
      const [firstOnlyPath = "", secondOnlyPath = "", ...commonPaths] = paths;
      return fc
        .record({
          changedPath: fc.constantFrom(...commonPaths),
          contents: fc.array(fc.string(), { minLength: paths.length, maxLength: paths.length }),
          revisedContent: fc.string(),
          firstJudgedPaths: arbitraryJudgedOrder([...commonPaths, firstOnlyPath]),
          secondJudgedPaths: arbitraryJudgedOrder([...commonPaths, secondOnlyPath]),
        })
        .map(({ changedPath, contents, revisedContent, firstJudgedPaths, secondJudgedPaths }) => ({
          commonPaths,
          firstOnlyPath,
          secondOnlyPath,
          changedPath,
          files: paths.map((path, index) => ({ path, content: contents[index] ?? "" })),
          revision: { path: changedPath, content: revisedContent },
          firstJudgedPaths,
          secondJudgedPaths,
        }))
        .filter(({ files, revision }) =>
          files.every((file) => file.path !== revision.path || file.content !== revision.content)
        );
    });
}

/**
 * The caller-supplied values of one `compare` invocation: the Change `--change` names, the distinct
 * run tokens its `--run` values name in order, and the input source a fresh `--input` would name.
 */
export interface RunComparisonInvocation {
  readonly change: string;
  readonly runTokens: readonly string[];
  readonly inputSource: string;
}

export function arbitraryRunComparisonInvocation(runCount: number): fc.Arbitrary<RunComparisonInvocation> {
  return fc.record({
    change: VERIFY_TEST_GENERATOR.changeIdentity(),
    runTokens: fc.uniqueArray(VERIFY_TEST_GENERATOR.runToken(), { minLength: runCount, maxLength: runCount }),
    inputSource: arbitrarySourceFilePath(),
  });
}

/**
 * The `--run` counts that violate the comparison's run count at its boundary: `absent`, the count of
 * an invocation naming no run at all, and `present`, every other count below the count `compare`
 * requires together with the first count beyond it.
 */
export interface ComparedRunCountViolations {
  readonly absent: number;
  readonly present: readonly number[];
}

const ABSENT_RUN_COUNT = 0;

export function comparedRunCountViolations(): ComparedRunCountViolations {
  return {
    absent: ABSENT_RUN_COUNT,
    present: [
      ...Array.from({ length: VERIFY_CLI.compareRunCount }, (_, index) => index).filter((count) =>
        count !== ABSENT_RUN_COUNT
      ),
      VERIFY_CLI.compareRunCount + 1,
    ],
  };
}

export const CHANGE_RUNS_TEST_GENERATOR = {
  scenario: (): fc.Arbitrary<ChangeRunsScenario> => arbitraryChangeRunsScenario(),
  runComparison: (): fc.Arbitrary<RunComparisonScenario> => arbitraryRunComparisonScenario(),
  runComparisonInvocation: (runCount: number): fc.Arbitrary<RunComparisonInvocation> =>
    arbitraryRunComparisonInvocation(runCount),
  comparedRunCountViolations: (): ComparedRunCountViolations => comparedRunCountViolations(),
  evidenceFreeTerminalStatuses: (): fc.Arbitrary<Readonly<Record<VerifyVerificationType, string>>> =>
    arbitraryEvidenceFreeTerminalStatuses(),
} as const;
