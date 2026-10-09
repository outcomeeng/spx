import { describe, expect, it } from "vitest";

import {
  classifyNodeStatus,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MECHANISM_OVERALL,
  rollupNodeStatusMechanism,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import {
  enumerateClassificationFacts,
  enumerateEvidenceOutcomeMultisets,
} from "@testing/generators/node-status/node-status";

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
