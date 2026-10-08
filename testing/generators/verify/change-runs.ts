import * as fc from "fast-check";

import {
  REVIEW_TERMINAL_STATUSES,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
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
  return fc.record({
    [VERIFY_VERIFICATION_TYPE.REVIEW]: fc.constantFrom(...REVIEW_TERMINAL_STATUSES),
    [VERIFY_VERIFICATION_TYPE.AUDIT]: fc.constant(JOURNAL_RUN_STATE_STATUS.REJECTED),
    [VERIFY_VERIFICATION_TYPE.TEST]: fc.constantFrom(...Object.values(JOURNAL_RUN_TERMINAL_STATUS)),
  } satisfies Record<VerifyVerificationType, fc.Arbitrary<string>>);
}

export const CHANGE_RUNS_TEST_GENERATOR = {
  scenario: (): fc.Arbitrary<ChangeRunsScenario> => arbitraryChangeRunsScenario(),
  evidenceFreeTerminalStatuses: (): fc.Arbitrary<Readonly<Record<VerifyVerificationType, string>>> =>
    arbitraryEvidenceFreeTerminalStatuses(),
} as const;
