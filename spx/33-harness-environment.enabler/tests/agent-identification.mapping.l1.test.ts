import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { AGENT_IDENTITY_KIND, type AgentIdentity, resolveAgentIdentity } from "@/lib/agent-environment";
import { AGENT_SESSION_TOKEN_PATTERN } from "@/lib/agent-environment/session-token";
import {
  arbitraryIdentityEnvironmentCase,
  type ExpectedAgentIdentity,
  IDENTITY_CASE,
  IDENTITY_MEMBER_VALUE_FORM,
  IDENTITY_NON_MEMBER_STATES,
  type IdentityCase,
  identityCaseOf,
  type IdentityMemberValueForm,
  identityVariableSubsets,
} from "@testing/generators/agent-environment/identity";

function subsetsOf(identityCase: IdentityCase): readonly (readonly string[])[] {
  return identityVariableSubsets().filter((members) => identityCaseOf(members) === identityCase);
}

/** Checks the resolver's verdict against what the case's size, membership, and member value decide. */
function expectIdentity(identity: AgentIdentity, expected: ExpectedAgentIdentity): void {
  if (expected.agent === undefined) {
    expect(identity.kind).not.toBe(AGENT_IDENTITY_KIND.IDENTIFIED);
    return;
  }
  expect(identity.kind).toBe(AGENT_IDENTITY_KIND.IDENTIFIED);
  if (identity.kind !== AGENT_IDENTITY_KIND.IDENTIFIED) return;
  expect(identity.agent).toBe(expected.agent);
  if (expected.normalizedFrom === undefined) {
    expect(identity.sessionId).toBe(expected.sessionId);
    return;
  }
  expect(identity.sessionId).toMatch(AGENT_SESSION_TOKEN_PATTERN);
  expect(identity.sessionId).not.toBe(expected.normalizedFrom);
}

describe("agent-identification", () => {
  const cases: readonly IdentityCase[] = [IDENTITY_CASE.NONE, IDENTITY_CASE.ONE, IDENTITY_CASE.SEVERAL];
  const forms: readonly IdentityMemberValueForm[] = Object.values(IDENTITY_MEMBER_VALUE_FORM);

  it("covers every subset of the registered identity variables with the three cases", () => {
    const covered = cases.flatMap((identityCase) => subsetsOf(identityCase));

    expect(covered).toHaveLength(identityVariableSubsets().length);
    expect(subsetsOf(IDENTITY_CASE.SEVERAL).length).toBeGreaterThan(0);
  });

  describe.each(forms)("member values in %s form", (memberForm) => {
    it.each(cases)("%s: maps each subset to the agent and session its size and membership decide", (identityCase) => {
      for (const members of subsetsOf(identityCase)) {
        fc.assert(
          fc.property(
            fc.constantFrom(...IDENTITY_NON_MEMBER_STATES).chain((state) =>
              arbitraryIdentityEnvironmentCase(members, state, memberForm)
            ),
            (testCase) => {
              expectIdentity(resolveAgentIdentity(testCase.environment), testCase.expected);
            },
          ),
        );
      }
    });
  });
});
