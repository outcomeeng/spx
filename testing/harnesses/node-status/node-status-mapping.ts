import { describe, expect, it } from "vitest";

import {
  classifyNodeStatus,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  rollupNodeStatusMechanism,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree/config";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";

// The rows below exercise the precedence contract declared in node-status.md:
// no verification -> declared; EXCLUDE-listed -> specified; all outcomes pass -> passing;
// every other verified, non-excluded outcome shape -> failing.

export function registerNodeStatusMappingEvidence(): void {
  describe("classifyNodeStatus over the full fact cube", () => {
    it("resolves to declared whenever the node has no linked verification, regardless of other facts", () => {
      for (const isExcluded of [false, true]) {
        for (const outcome of Object.values(NODE_STATUS_EVIDENCE_OUTCOME)) {
          expect(classifyNodeStatus({
            hasVerificationReferences: false,
            isExcluded,
            verification: testVerification(outcome),
          })).toBe(
            SPEC_TREE_NODE_STATE.DECLARED,
          );
        }
      }
    });

    it("resolves a verified, EXCLUDE-listed node to specified, regardless of verification outcome", () => {
      for (const outcome of Object.values(NODE_STATUS_EVIDENCE_OUTCOME)) {
        expect(classifyNodeStatus({
          hasVerificationReferences: true,
          isExcluded: true,
          verification: testVerification(outcome),
        })).toBe(
          SPEC_TREE_NODE_STATE.SPECIFIED,
        );
      }
    });

    it("resolves a verified, non-excluded node whose outcomes pass to passing", () => {
      expect(classifyNodeStatus({
        hasVerificationReferences: true,
        isExcluded: false,
        verification: testVerification(NODE_STATUS_EVIDENCE_OUTCOME.PASSED),
      })).toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });

    it("resolves a verified, non-excluded node whose mechanisms all pass to passing", () => {
      expect(classifyNodeStatus({
        hasVerificationReferences: true,
        isExcluded: false,
        verification: {
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(outcomes(
            NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          )),
          [NODE_STATUS_VERIFICATION_MECHANISM.EVAL]: createNodeStatusMechanismRecord(outcomes(
            NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          )),
        },
      })).toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
    });

    it("resolves a verified, non-excluded node with any non-passing mechanism to failing", () => {
      expect(classifyNodeStatus({
        hasVerificationReferences: true,
        isExcluded: false,
        verification: {
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(outcomes(
            NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          )),
          [NODE_STATUS_VERIFICATION_MECHANISM.AUDIT]: createNodeStatusMechanismRecord(outcomes(
            NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
          )),
        },
      })).toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
    });

    it("resolves a verified, non-excluded node whose outcomes do not all pass to failing", () => {
      for (
        const verification of [
          testVerification(NODE_STATUS_EVIDENCE_OUTCOME.FAILED),
          testVerification(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN),
          testVerification(NODE_STATUS_EVIDENCE_OUTCOME.PASSED, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN),
        ]
      ) {
        expect(classifyNodeStatus({
          hasVerificationReferences: true,
          isExcluded: false,
          verification,
        })).toBe(
          SPEC_TREE_NODE_STATE.FAILING,
        );
      }
    });
  });

  describe("rollupNodeStatusMechanism", () => {
    it("maps all passed outcomes to passed", () => {
      expect(rollupNodeStatusMechanism(outcomes(
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      ))).toBe(NODE_STATUS_MECHANISM_OVERALL.PASSED);
    });

    it("maps any failed outcome to failed", () => {
      expect(rollupNodeStatusMechanism(outcomes(
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      ))).toBe(NODE_STATUS_MECHANISM_OVERALL.FAILED);
    });

    it("maps passed plus not-run outcomes to partial", () => {
      expect(rollupNodeStatusMechanism(outcomes(
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      ))).toBe(NODE_STATUS_MECHANISM_OVERALL.PARTIAL);
    });

    it("maps all not-run outcomes to not-run", () => {
      expect(rollupNodeStatusMechanism(outcomes(
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      ))).toBe(NODE_STATUS_MECHANISM_OVERALL.NOT_RUN);
    });
  });
}

function testVerification(
  ...values: readonly NodeStatusEvidenceOutcome[]
) {
  return {
    [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(outcomes(...values)),
  };
}

function outcomes(
  ...values: readonly NodeStatusEvidenceOutcome[]
): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  return Object.fromEntries(
    values.map((outcome) => [sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.statusReference()), outcome]),
  );
}
