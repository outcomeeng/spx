import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BRANCH_CHECKOUT_FLAG,
  type CheckoutFacts,
  DEPS_INSTALL_GATE_EXIT_CODE,
  depsInstallGateExitCode,
  LOCKFILE_NAME,
  resolveCheckoutFacts,
} from "@/lib/precommit/deps-install-gate";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

describe("depsInstallGateExitCode", () => {
  it("maps a branch-or-HEAD checkout whose lockfile changed to the install exit code", () => {
    const facts: CheckoutFacts = { branchCheckout: true, lockfileChanged: true };

    expect(depsInstallGateExitCode(facts)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.INSTALL);
  });

  it("maps a file checkout to the skip exit code even when the lockfile changed", () => {
    const facts: CheckoutFacts = { branchCheckout: false, lockfileChanged: true };

    expect(depsInstallGateExitCode(facts)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
  });

  it("maps an unchanged lockfile to the skip exit code for any checkout kind", () => {
    const branchUnchanged: CheckoutFacts = { branchCheckout: true, lockfileChanged: false };
    const fileUnchanged: CheckoutFacts = { branchCheckout: false, lockfileChanged: false };

    expect(depsInstallGateExitCode(branchUnchanged)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
    expect(depsInstallGateExitCode(fileUnchanged)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
  });
});

describe("resolveCheckoutFacts", () => {
  it("maps the git branch-checkout flag to the branch-checkout fact", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.realCheckoutRef(),
        PRECOMMIT_TEST_GENERATOR.nonBranchCheckoutFlag(),
        (previousRef, nonBranchFlag) => {
          expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, []).branchCheckout).toBe(true);
          expect(resolveCheckoutFacts(previousRef, nonBranchFlag, []).branchCheckout).toBe(false);
        },
      ),
    );
  });

  it("maps a null or all-zero previous ref to a changed lockfile, regardless of the diff content", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.nullCheckoutRef(),
        PRECOMMIT_TEST_GENERATOR.fileList(),
        (nullPreviousRef, arbitraryDiff) => {
          expect(resolveCheckoutFacts(nullPreviousRef, BRANCH_CHECKOUT_FLAG, arbitraryDiff).lockfileChanged)
            .toBe(true);
        },
      ),
    );
  });

  it("maps a null previous ref on a non-branch checkout to a changed lockfile with no branch checkout", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.nullCheckoutRef(),
        PRECOMMIT_TEST_GENERATOR.nonBranchCheckoutFlag(),
        PRECOMMIT_TEST_GENERATOR.fileList(),
        (nullPreviousRef, nonBranchFlag, arbitraryDiff) => {
          const facts = resolveCheckoutFacts(nullPreviousRef, nonBranchFlag, arbitraryDiff);
          expect(facts.branchCheckout).toBe(false);
          expect(facts.lockfileChanged).toBe(true);
        },
      ),
    );
  });

  it("maps a real previous ref to a changed lockfile exactly when the lockfile-scoped diff is non-empty", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.realCheckoutRef(), (previousRef) => {
        expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, []).lockfileChanged).toBe(false);
        expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, [LOCKFILE_NAME]).lockfileChanged)
          .toBe(true);
      }),
    );
  });
});
