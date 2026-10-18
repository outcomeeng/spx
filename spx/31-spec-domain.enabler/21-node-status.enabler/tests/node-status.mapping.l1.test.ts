import { describe, expect, it } from "vitest";

import {
  classifyNodeClaim,
  classifyNodeStatus,
  NODE_STATUS_CURRENCY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  nodeStatusClaimVerdicts,
  rollupNodeStatusMechanism,
  serializeNodeStatusClaim,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import {
  ANCESTOR_DECISION_PLACEMENT,
  createClaimWithVerdicts,
  DECISION_PLACEMENT,
  enumerateClaimClassificationFacts,
  enumerateClassificationFacts,
  enumerateDecisionPlacements,
  enumerateEvidenceOutcomeMultisets,
  enumerateNestedDecisionPlacements,
  NODE_STATUS_TEST_GENERATOR,
} from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { observeStateAfterDecisionEdit } from "@testing/harnesses/node-status/node-status";

describe("classifyNodeStatus over every combination of linked references, EXCLUDE listing, and committed outcomes", () => {
  it("resolves declared, then specified, then passing when every committed mechanism passes, else failing", () => {
    for (const facts of enumerateClassificationFacts()) {
      const committedOverallValues = Object.values(facts.verification ?? {}).map((record) =>
        record[NODE_STATUS_FIELD.OVERALL]
      );
      expect(classifyNodeStatus(facts), JSON.stringify(facts)).toBe(
        !facts.hasVerificationReferences
          ? SPEC_TREE_NODE_STATE.DECLARED
          : facts.isExcluded
          ? SPEC_TREE_NODE_STATE.SPECIFIED
          : committedOverallValues.length > 0
              && committedOverallValues.every((overall) => overall === NODE_STATUS_MECHANISM_OVERALL.PASSED)
          ? SPEC_TREE_NODE_STATE.PASSING
          : SPEC_TREE_NODE_STATE.FAILING,
      );
    }
  });
});

describe("classifyNodeClaim over every combination of required artifacts, recorded passing, and result sets", () => {
  it("resolves passing, then failing, then declared, then specified", () => {
    for (const facts of enumerateClaimClassificationFacts()) {
      const everyResultHolds = facts.results.length > 0
        && facts.results.every((result) =>
          result.verdict === NODE_STATUS_EVIDENCE_OUTCOME.PASSED && result.currency === NODE_STATUS_CURRENCY.CURRENT
        );
      expect(classifyNodeClaim(facts), JSON.stringify(facts)).toBe(
        !facts.requiredArtifactsMissing && everyResultHolds
          ? SPEC_TREE_NODE_STATE.PASSING
          : facts.recordedPassingAtOrAfterDeclaration
          ? SPEC_TREE_NODE_STATE.FAILING
          : facts.requiredArtifactsMissing
          ? SPEC_TREE_NODE_STATE.DECLARED
          : SPEC_TREE_NODE_STATE.SPECIFIED,
      );
    }
  });
});

describe("the Git-history clause of classifyNodeClaim over every placement of a decision record relative to a node", () => {
  it("resolves specified when a decision governing a top-level node changes after the claim recorded passing, and failing when any other decision changes", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    for (const placement of enumerateDecisionPlacements()) {
      expect(await observeStateAfterDecisionEdit(fixture, placement), placement).toBe(
        placement === DECISION_PLACEMENT.OWN_DIRECTORY || placement === DECISION_PLACEMENT.ROOT_LOWER_INDEX
          ? SPEC_TREE_NODE_STATE.SPECIFIED
          : SPEC_TREE_NODE_STATE.FAILING,
      );
    }
  });

  it("resolves specified when a decision governing a nested node, beside the node, its ancestor, or the product root below the ancestor, changes after the claim recorded passing, and failing when any other decision changes", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.nestedPinnedNode());
    for (const placement of enumerateNestedDecisionPlacements()) {
      expect(await observeStateAfterDecisionEdit(fixture, placement), placement).toBe(
        placement === DECISION_PLACEMENT.OWN_DIRECTORY
          || placement === DECISION_PLACEMENT.ROOT_LOWER_INDEX
          || placement === ANCESTOR_DECISION_PLACEMENT.ANCESTOR_LOWER_INDEX
          ? SPEC_TREE_NODE_STATE.SPECIFIED
          : SPEC_TREE_NODE_STATE.FAILING,
      );
    }
  });
});

describe("the verdicts of a 4.0 claim over outcome multisets of every composition and multiplicity", () => {
  it("map each entry's own verdict to lifecycle input and carry no overall rollup", () => {
    const commit = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.commitId());
    for (const outcomes of enumerateEvidenceOutcomeMultisets()) {
      const claim = createClaimWithVerdicts(outcomes, commit, [commit]);

      expect(nodeStatusClaimVerdicts(claim), JSON.stringify(outcomes)).toEqual(Object.values(outcomes));
      expect(serializeNodeStatusClaim(claim)).not.toContain(NODE_STATUS_FIELD.OVERALL);
    }
  });
});

describe("rollupNodeStatusMechanism over outcome multisets of every composition and multiplicity", () => {
  it("maps all passed to passed, any failed to failed, passed mixed with not-run to partial, and all not-run to not-run", () => {
    for (const outcomes of enumerateEvidenceOutcomeMultisets()) {
      const values = Object.values(outcomes);
      expect(rollupNodeStatusMechanism(outcomes), JSON.stringify(values)).toBe(
        values.includes(NODE_STATUS_EVIDENCE_OUTCOME.FAILED)
          ? NODE_STATUS_MECHANISM_OVERALL.FAILED
          : values.every((outcome) => outcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED)
          ? NODE_STATUS_MECHANISM_OVERALL.PASSED
          : values.every((outcome) => outcome === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN)
          ? NODE_STATUS_MECHANISM_OVERALL.NOT_RUN
          : NODE_STATUS_MECHANISM_OVERALL.PARTIAL,
      );
    }
  });
});
