import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { AGENT_IDENTITY_KIND, type AgentIdentity, resolveAgentIdentity } from "@/lib/agent-environment";
import {
  arbitraryIdentityEnvironmentCase,
  type ExpectedAgentIdentity,
  IDENTITY_CASE,
  IDENTITY_NON_MEMBER_STATES,
  type IdentityCase,
  identityCaseOf,
  identityVariableSubsets,
} from "@testing/generators/agent-environment/identity";

function observedIdentity(identity: AgentIdentity): ExpectedAgentIdentity {
  return identity.kind === AGENT_IDENTITY_KIND.IDENTIFIED
    ? { agent: identity.agent, sessionId: identity.sessionId }
    : {};
}

function subsetsOf(identityCase: IdentityCase): readonly (readonly string[])[] {
  return identityVariableSubsets().filter((members) => identityCaseOf(members) === identityCase);
}

describe("agent-identification", () => {
  const cases: readonly IdentityCase[] = [IDENTITY_CASE.NONE, IDENTITY_CASE.ONE, IDENTITY_CASE.SEVERAL];

  it("covers every subset of the registered identity variables with the three cases", () => {
    const covered = cases.flatMap((identityCase) => subsetsOf(identityCase));

    expect(covered).toHaveLength(identityVariableSubsets().length);
    expect(subsetsOf(IDENTITY_CASE.SEVERAL).length).toBeGreaterThan(0);
  });

  it.each(cases)("%s: maps each subset to the agent and session its size and membership decide", (identityCase) => {
    for (const members of subsetsOf(identityCase)) {
      fc.assert(
        fc.property(
          fc.constantFrom(...IDENTITY_NON_MEMBER_STATES).chain((state) =>
            arbitraryIdentityEnvironmentCase(members, state)
          ),
          (testCase) => {
            expect(observedIdentity(resolveAgentIdentity(testCase.environment))).toEqual(testCase.expected);
          },
        ),
      );
    }
  });
});
