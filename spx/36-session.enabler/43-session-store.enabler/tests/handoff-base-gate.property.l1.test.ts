import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SessionHandoffBaseError } from "@/domains/session/errors";
import { type HandoffGitFacts, resolveHandoffGitRef } from "@/domains/session/handoff-base";
import { HANDOFF_BASE_PREREQUISITE_LABEL, HANDOFF_BASE_REMEDY } from "@/domains/session/handoff-base-checklist";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { arbitraryCommitSha, arbitraryHandoffGitFacts } from "@testing/generators/session/handoff-base";

/** Resolves the ref, or returns the handoff-base refusal it raises. */
function captureRefusal(facts: HandoffGitFacts): SessionHandoffBaseError {
  try {
    resolveHandoffGitRef(facts);
  } catch (error) {
    if (error instanceof SessionHandoffBaseError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected resolveHandoffGitRef to refuse");
}

/** Two distinct commit SHAs — a HEAD off the resolved tip. */
const arbitraryDistinctShas = (): fc.Arbitrary<readonly [string, string]> =>
  fc.tuple(arbitraryCommitSha(), arbitraryCommitSha()).filter(([head, tip]) => head !== tip);

describe("resolveHandoffGitRef — base resolution", () => {
  it("records the branch name on a main checkout that is on a branch", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryBranchName(), (facts, branch) => {
        expect(resolveHandoffGitRef({ ...facts, isGitRepo: true, isMainCheckout: true, branch })).toBe(branch);
      }),
    );
  });

  it("records the HEAD SHA on a detached main checkout", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryCommitSha(), (facts, headSha) => {
        expect(
          resolveHandoffGitRef({ ...facts, isGitRepo: true, isMainCheckout: true, branch: null, headSha }),
        ).toBe(headSha);
      }),
    );
  });

  it("records the origin tip SHA on a clean non-main checkout detached at the tip", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryCommitSha(), (facts, tipSha) => {
        expect(
          resolveHandoffGitRef({
            ...facts,
            isGitRepo: true,
            isMainCheckout: false,
            isClean: true,
            branch: null,
            headSha: tipSha,
            defaultTipSha: tipSha,
          }),
        ).toBe(tipSha);
      }),
    );
  });
});

describe("resolveHandoffGitRef — refusals", () => {
  it("refuses a non-git base silently with no checklist", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), (facts) => {
        const error = captureRefusal({ ...facts, isGitRepo: false });
        expect(error.silent).toBe(true);
        expect(error.checklist).toBeNull();
      }),
    );
  });

  it("refuses a main checkout with no reachable HEAD with a diagnostic, not silently and not a checklist", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), (facts) => {
        const error = captureRefusal({ ...facts, isGitRepo: true, isMainCheckout: true, branch: null, headSha: null });
        expect(error.silent).toBe(false);
        expect(error.checklist).toBeNull();
      }),
    );
  });

  it("carries a two-prerequisite checklist whose resolved facts equal the inputs", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), (facts) => {
        // A dirty non-main checkout always refuses, whatever the tip state.
        const refused = { ...facts, isGitRepo: true, isMainCheckout: false, isClean: false };
        const checklist = captureRefusal(refused).checklist;

        expect(checklist).not.toBeNull();
        expect(checklist?.prerequisites).toHaveLength(2);
        expect(checklist?.prerequisites[0]).toEqual({
          label: HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE,
          met: false,
          remedy: HANDOFF_BASE_REMEDY.COMMIT_OR_MAIN_CHECKOUT,
        });
        expect(checklist?.defaultBranch).toBe(refused.defaultBranch);
        expect(checklist?.defaultTipSha).toBe(refused.defaultTipSha);
        expect(checklist?.headSha).toBe(refused.headSha);
        expect(checklist?.currentWorktreePath).toBe(refused.currentWorktreePath);
        expect(checklist?.mainCheckoutPath).toBe(refused.mainCheckoutPath);
      }),
    );
  });

  it("marks the clean prerequisite met when the working tree is clean", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryDistinctShas(), (facts, [headSha, tipSha]) => {
        // Clean but off the tip → refused with the clean prerequisite met.
        const refused = {
          ...facts,
          isGitRepo: true,
          isMainCheckout: false,
          isClean: true,
          branch: null,
          headSha,
          defaultTipSha: tipSha,
        };
        const checklist = captureRefusal(refused).checklist;

        expect(checklist?.prerequisites[0]).toEqual({
          label: HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE,
          met: true,
          remedy: "",
        });
      }),
    );
  });

  it("marks the at-tip prerequisite met when HEAD is detached at the resolved tip", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryCommitSha(), (facts, tipSha) => {
        // Dirty forces refusal; detached at the tip → at-tip met.
        const refused = {
          ...facts,
          isGitRepo: true,
          isMainCheckout: false,
          isClean: false,
          branch: null,
          headSha: tipSha,
          defaultTipSha: tipSha,
        };
        const checklist = captureRefusal(refused).checklist;

        expect(checklist?.prerequisites[1]).toEqual({
          label: HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP,
          met: true,
          remedy: "",
        });
      }),
    );
  });

  it("marks the at-tip prerequisite unmet with the detach remedy when off a resolved tip", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), arbitraryDistinctShas(), (facts, [headSha, tipSha]) => {
        const refused = {
          ...facts,
          isGitRepo: true,
          isMainCheckout: false,
          isClean: true,
          branch: null,
          headSha,
          defaultTipSha: tipSha,
        };
        const checklist = captureRefusal(refused).checklist;

        expect(checklist?.prerequisites[1]).toEqual({
          label: HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP,
          met: false,
          remedy: HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT,
        });
      }),
    );
  });

  it("marks clean met and at-tip unmet on a clean non-main checkout sitting on a branch", () => {
    fc.assert(
      fc.property(
        arbitraryHandoffGitFacts(),
        arbitraryBranchName(),
        fc.option(arbitraryCommitSha(), { nil: null }),
        (facts, branch, defaultTipSha) => {
          // A clean working tree with HEAD on a named branch (not detached) → the clean
          // prerequisite reads met while the at-tip prerequisite reads unmet because HEAD
          // is on a branch, its remedy following whether the tip resolved.
          const refused = { ...facts, isGitRepo: true, isMainCheckout: false, isClean: true, branch, defaultTipSha };
          const prerequisites = captureRefusal(refused).checklist?.prerequisites;

          expect(prerequisites?.[0]).toEqual({
            label: HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE,
            met: true,
            remedy: "",
          });
          expect(prerequisites?.[1]).toEqual({
            label: HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP,
            met: false,
            remedy: defaultTipSha === null
              ? HANDOFF_BASE_REMEDY.MAIN_CHECKOUT_ONLY
              : HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT,
          });
        },
      ),
    );
  });

  it("marks the at-tip prerequisite unmet with the main-checkout-only remedy when the tip is unresolved", () => {
    fc.assert(
      fc.property(arbitraryHandoffGitFacts(), (facts) => {
        // An unresolved tip can never be at-tip, so the base is refused.
        const refused = { ...facts, isGitRepo: true, isMainCheckout: false, branch: null, defaultTipSha: null };
        const atTip = captureRefusal(refused).checklist?.prerequisites[1];

        expect(atTip?.met).toBe(false);
        expect(atTip?.remedy).toBe(HANDOFF_BASE_REMEDY.MAIN_CHECKOUT_ONLY);
      }),
    );
  });
});
