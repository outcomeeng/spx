import { expect } from "vitest";

import {
  classifyNodeStatus,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_VERIFICATION_MECHANISM,
  rollupNodeStatusMechanism,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree/config";
import {
  createGeneratedEvidenceOutcomes,
  createGeneratedTestVerification,
} from "@testing/generators/node-status/node-status";

export function assertUnverifiedNodesAreDeclared(): void {
  for (const isExcluded of [false, true]) {
    for (const outcome of Object.values(NODE_STATUS_EVIDENCE_OUTCOME)) {
      expect(classifyNodeStatus({
        hasVerificationReferences: false,
        isExcluded,
        verification: createGeneratedTestVerification([outcome]),
      })).toBe(
        SPEC_TREE_NODE_STATE.DECLARED,
      );
    }
  }
}

export function assertExcludedVerifiedNodesAreSpecified(): void {
  for (const outcome of Object.values(NODE_STATUS_EVIDENCE_OUTCOME)) {
    expect(classifyNodeStatus({
      hasVerificationReferences: true,
      isExcluded: true,
      verification: createGeneratedTestVerification([outcome]),
    })).toBe(
      SPEC_TREE_NODE_STATE.SPECIFIED,
    );
  }
}

export function assertPassingTestOutcomeClassifiesPassing(): void {
  expect(classifyNodeStatus({
    hasVerificationReferences: true,
    isExcluded: false,
    verification: createGeneratedTestVerification([NODE_STATUS_EVIDENCE_OUTCOME.PASSED]),
  })).toBe(
    SPEC_TREE_NODE_STATE.PASSING,
  );
}

export function assertAllPassingMechanismsClassifyPassing(): void {
  expect(classifyNodeStatus({
    hasVerificationReferences: true,
    isExcluded: false,
    verification: {
      [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(createGeneratedEvidenceOutcomes([
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      ])),
      [NODE_STATUS_VERIFICATION_MECHANISM.EVAL]: createNodeStatusMechanismRecord(createGeneratedEvidenceOutcomes([
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      ])),
    },
  })).toBe(
    SPEC_TREE_NODE_STATE.PASSING,
  );
}

export function assertNonPassingMechanismClassifiesFailing(): void {
  expect(classifyNodeStatus({
    hasVerificationReferences: true,
    isExcluded: false,
    verification: {
      [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(createGeneratedEvidenceOutcomes([
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      ])),
      [NODE_STATUS_VERIFICATION_MECHANISM.AUDIT]: createNodeStatusMechanismRecord(createGeneratedEvidenceOutcomes([
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      ])),
    },
  })).toBe(
    SPEC_TREE_NODE_STATE.FAILING,
  );
}

export function assertNonPassingOutcomesClassifyFailing(): void {
  for (
    const verification of [
      createGeneratedTestVerification([NODE_STATUS_EVIDENCE_OUTCOME.FAILED]),
      createGeneratedTestVerification([NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN]),
      createGeneratedTestVerification([
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      ]),
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
}

export function assertPassedOutcomesRollUpPassed(): void {
  expect(rollupNodeStatusMechanism(createGeneratedEvidenceOutcomes([
    NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
    NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
  ]))).toBe(NODE_STATUS_MECHANISM_OVERALL.PASSED);
}

export function assertFailedOutcomeRollsUpFailed(): void {
  expect(rollupNodeStatusMechanism(createGeneratedEvidenceOutcomes([
    NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
    NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
    NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
  ]))).toBe(NODE_STATUS_MECHANISM_OVERALL.FAILED);
}

export function assertMixedPassedAndNotRunRollsUpPartial(): void {
  expect(rollupNodeStatusMechanism(createGeneratedEvidenceOutcomes([
    NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
    NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
  ]))).toBe(NODE_STATUS_MECHANISM_OVERALL.PARTIAL);
}

export function assertNotRunOutcomesRollUpNotRun(): void {
  expect(rollupNodeStatusMechanism(createGeneratedEvidenceOutcomes([
    NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
    NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
  ]))).toBe(NODE_STATUS_MECHANISM_OVERALL.NOT_RUN);
}
