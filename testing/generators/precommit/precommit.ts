import * as fc from "fast-check";

import { BRANCH_CHECKOUT_FLAG } from "@/lib/precommit/deps-install-gate";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

const MAX_GIT_OID_HEX_LENGTH = 64;
const NON_ZERO_HEX_DIGIT = /[1-9a-f]/;
const ZERO_HEX_DIGIT = "0";
const HEX_CHECKOUT_REF_PATTERN = new RegExp(`^[0-9a-f]{1,${MAX_GIT_OID_HEX_LENGTH}}$`);

export const PRECOMMIT_TEST_GENERATOR = {
  exitCode: arbitraryNonSuccessExitCode,
  fileList: arbitraryFileList,
  fileContent: arbitraryFileContent,
  path: arbitraryPath,
  pathSegment: arbitraryPathSegment,
  pathFragment: arbitraryPathFragment,
  posixDirectoryPrefix: arbitraryPosixDirectoryPrefix,
  windowsDirectoryPrefix: arbitraryWindowsDirectoryPrefix,
  otherPath: arbitraryOtherPath,
  nullCheckoutRef: arbitraryNullCheckoutRef,
  realCheckoutRef: arbitraryRealCheckoutRef,
  nonBranchCheckoutFlag: arbitraryNonBranchCheckoutFlag,
} as const;

export const PRECOMMIT_TEST_FIXTURE = {
  FAILING_TEST_NAME: "intentionally fails to test pre-commit blocking",
  PASSING_TEST_NAME: "correctly tests addition",
} as const;

export function samplePrecommitTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) throw new Error("Precommit test generator returned no sample");
  return value;
}

function arbitraryPathFragment(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { maxLength: 3 }).map((segments) => segments.join("/"));
}

function arbitraryFileContent(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1 });
}

function arbitraryPosixDirectoryPrefix(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join("/")}`);
}

function arbitraryWindowsDirectoryPrefix(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 })
    .map((segments) => `C:\\${segments.join("\\")}`);
}

function arbitraryOtherPath(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((slug) => `${slug}.md`);
}

function arbitraryPath(): fc.Arbitrary<string> {
  return fc.oneof(arbitraryOtherPath(), arbitraryPathFragment());
}

function arbitraryFileList(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryPath());
}

function arbitraryNonSuccessExitCode(): fc.Arbitrary<number> {
  const minNonSuccessExitCode = 2;
  const maxProcessExitCode = 255;
  return fc.integer({ min: minNonSuccessExitCode, max: maxProcessExitCode });
}

/** Git's null previous ref forms: the empty ref and all-zero object ids of any length. */
function arbitraryNullCheckoutRef(): fc.Arbitrary<string> {
  return fc.nat({ max: MAX_GIT_OID_HEX_LENGTH }).map((zeroCount) => ZERO_HEX_DIGIT.repeat(zeroCount));
}

/** A real (non-null) previous ref: a hex object id carrying at least one non-zero digit. */
function arbitraryRealCheckoutRef(): fc.Arbitrary<string> {
  return fc.stringMatching(HEX_CHECKOUT_REF_PATTERN).filter((ref) => NON_ZERO_HEX_DIGIT.test(ref));
}

/** Any post-checkout flag value other than the branch-checkout flag — e.g. git's file-checkout "0". */
function arbitraryNonBranchCheckoutFlag(): fc.Arbitrary<string> {
  return fc.string().filter((flag) => flag !== BRANCH_CHECKOUT_FLAG);
}
