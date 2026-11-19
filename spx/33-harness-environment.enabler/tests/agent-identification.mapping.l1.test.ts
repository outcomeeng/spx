import { describe, expect, it } from "vitest";

import { AGENT_IDENTITY_VARIABLE, resolveAgentIdentity } from "@/domains/agent-environment/config";
import {
  arbitraryIdentityEnvironmentCase,
  IDENTITY_NON_MEMBER_STATES,
  identityVariableSubsets,
} from "@testing/generators/agent-environment/identity";
import { sampleGeneratedValue } from "@testing/generators/sample";

describe("agent identification over every subset of the identity variables", () => {
  it("covers every subset of the source-owned identity variables", () => {
    expect(identityVariableSubsets()).toHaveLength(2 ** Object.values(AGENT_IDENTITY_VARIABLE).length);
  });

  for (const members of identityVariableSubsets()) {
    for (const nonMemberState of IDENTITY_NON_MEMBER_STATES) {
      for (const withHookExports of [false, true]) {
        it(`maps members [${members.join(", ")}] with non-members ${nonMemberState} and hook exports ${withHookExports} to the identity rule's verdict`, () => {
          const { environment, expected } = sampleGeneratedValue(
            arbitraryIdentityEnvironmentCase({ members, nonMemberState, withHookExports }),
          );

          expect(resolveAgentIdentity(environment)).toEqual(expected);
        });
      }
    }
  }
});
