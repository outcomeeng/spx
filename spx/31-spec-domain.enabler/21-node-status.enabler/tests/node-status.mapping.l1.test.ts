import {
  assertAllPassingMechanismsClassifyPassing,
  assertExcludedVerifiedNodesAreSpecified,
  assertFailedOutcomeRollsUpFailed,
  assertMixedPassedAndNotRunRollsUpPartial,
  assertNonPassingMechanismClassifiesFailing,
  assertNonPassingOutcomesClassifyFailing,
  assertNotRunOutcomesRollUpNotRun,
  assertPassedOutcomesRollUpPassed,
  assertPassingTestOutcomeClassifiesPassing,
  assertUnverifiedNodesAreDeclared,
} from "@testing/harnesses/node-status/node-status-mapping";
import { describe, it } from "vitest";

describe("classifyNodeStatus over the full fact cube", () => {
  it("resolves to declared whenever the node has no linked verification, regardless of other facts", () => {
    assertUnverifiedNodesAreDeclared();
  });

  it("resolves a verified, EXCLUDE-listed node to specified, regardless of verification outcome", () => {
    assertExcludedVerifiedNodesAreSpecified();
  });

  it("resolves a verified, non-excluded node whose outcomes pass to passing", () => {
    assertPassingTestOutcomeClassifiesPassing();
  });

  it("resolves a verified, non-excluded node whose mechanisms all pass to passing", () => {
    assertAllPassingMechanismsClassifyPassing();
  });

  it("resolves a verified, non-excluded node with any non-passing mechanism to failing", () => {
    assertNonPassingMechanismClassifiesFailing();
  });

  it("resolves a verified, non-excluded node whose outcomes do not all pass to failing", () => {
    assertNonPassingOutcomesClassifyFailing();
  });
});

describe("rollupNodeStatusMechanism", () => {
  it("maps all passed outcomes to passed", () => {
    assertPassedOutcomesRollUpPassed();
  });

  it("maps any failed outcome to failed", () => {
    assertFailedOutcomeRollsUpFailed();
  });

  it("maps passed plus not-run outcomes to partial", () => {
    assertMixedPassedAndNotRunRollsUpPartial();
  });

  it("maps all not-run outcomes to not-run", () => {
    assertNotRunOutcomesRollUpNotRun();
  });
});
