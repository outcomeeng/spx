/**
 * Agent identity environment generators.
 *
 * Construct the invoking environments the identity rule judges, together with the verdict each
 * construction yields. The construction law is the subset of registered identity variables that
 * holds a value: exactly one member identifies the agent whose module declares it, with the
 * member's value as its session id, and none or several identify no agent and no session.
 */
import * as fc from "fast-check";

import { AGENT_REGISTRY, type AgentModule, REGISTERED_IDENTITY_VARIABLES } from "@/lib/agent-environment";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** How a registered identity variable outside the case's non-empty subset reads in the environment. */
export const IDENTITY_NON_MEMBER_STATE = {
  ABSENT: "absent",
  EMPTY: "empty",
  WHITESPACE: "whitespace",
} as const;

export type IdentityNonMemberState = (typeof IDENTITY_NON_MEMBER_STATE)[keyof typeof IDENTITY_NON_MEMBER_STATE];

export const IDENTITY_NON_MEMBER_STATES: readonly IdentityNonMemberState[] = Object.values(IDENTITY_NON_MEMBER_STATE);

/** The Mapping case a subset of non-empty registered identity variables falls in, by its size. */
export const IDENTITY_CASE = {
  NONE: "none",
  ONE: "one",
  SEVERAL: "several",
} as const;

export type IdentityCase = (typeof IDENTITY_CASE)[keyof typeof IDENTITY_CASE];

/** The identified agent and session a case expects, or none of either. */
export interface ExpectedAgentIdentity {
  readonly agent?: AgentModule;
  readonly sessionId?: string;
}

export interface IdentityEnvironmentCase {
  readonly members: readonly string[];
  readonly nonMemberState: IdentityNonMemberState;
  readonly identityCase: IdentityCase;
  readonly environment: Readonly<Record<string, string>>;
  readonly expected: ExpectedAgentIdentity;
}

const WHITESPACE_RUN_UNITS = [" ", "\t", "\n"] as const;
const WHITESPACE_RUN_MIN_LENGTH = 1;
const WHITESPACE_RUN_MAX_LENGTH = 4;
const MEMBER_PADDING_MAX_LENGTH = 2;

/** Every subset of the registered identity variables, generated from the registry, the empty subset first. */
export function identityVariableSubsets(): readonly (readonly string[])[] {
  return REGISTERED_IDENTITY_VARIABLES.reduce<string[][]>(
    (subsets, variable) => [...subsets, ...subsets.map((subset) => [...subset, variable])],
    [[]],
  );
}

/** The Mapping case of a subset, by its size alone. */
export function identityCaseOf(members: readonly string[]): IdentityCase {
  if (members.length === 0) return IDENTITY_CASE.NONE;
  return members.length === 1 ? IDENTITY_CASE.ONE : IDENTITY_CASE.SEVERAL;
}

function arbitraryWhitespaceRun(minLength: number): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...WHITESPACE_RUN_UNITS),
    minLength,
    maxLength: WHITESPACE_RUN_MAX_LENGTH,
  });
}

function arbitraryNonMemberValue(state: IdentityNonMemberState): fc.Arbitrary<string | undefined> {
  switch (state) {
    case IDENTITY_NON_MEMBER_STATE.ABSENT:
      return fc.constant(undefined);
    case IDENTITY_NON_MEMBER_STATE.EMPTY:
      return fc.constant("");
    case IDENTITY_NON_MEMBER_STATE.WHITESPACE:
      return arbitraryWhitespaceRun(WHITESPACE_RUN_MIN_LENGTH);
  }
}

/** A session value already in safe-token form, padded with whitespace the rule trims. */
function arbitraryMemberValue(): fc.Arbitrary<{ readonly raw: string; readonly session: string }> {
  return fc
    .tuple(arbitraryWhitespaceRun(0), arbitraryDomainLiteral(), arbitraryWhitespaceRun(0))
    .filter(([before, , after]) =>
      before.length <= MEMBER_PADDING_MAX_LENGTH && after.length <= MEMBER_PADDING_MAX_LENGTH
    )
    .map(([before, session, after]) => ({ raw: `${before}${session}${after}`, session }));
}

function expectedIdentity(members: readonly string[], sessions: ReadonlyMap<string, string>): ExpectedAgentIdentity {
  if (members.length !== 1) return {};
  const [only] = members;
  return {
    agent: AGENT_REGISTRY.find((agent) => agent.identityVariable === only),
    sessionId: sessions.get(only),
  };
}

/**
 * One invoking environment for a subset: each member holds a generated session value, and each
 * other registered identity variable reads as the given non-member state.
 */
export function arbitraryIdentityEnvironmentCase(
  members: readonly string[],
  nonMemberState: IdentityNonMemberState,
): fc.Arbitrary<IdentityEnvironmentCase> {
  const nonMembers = REGISTERED_IDENTITY_VARIABLES.filter((variable) => !members.includes(variable));
  return fc
    .tuple(
      fc.tuple(...members.map(() => arbitraryMemberValue())),
      fc.tuple(...nonMembers.map(() => arbitraryNonMemberValue(nonMemberState))),
    )
    .map(([memberValues, nonMemberValues]) => {
      const environment: Record<string, string> = {};
      const sessions = new Map<string, string>();
      members.forEach((variable, index) => {
        environment[variable] = memberValues[index].raw;
        sessions.set(variable, memberValues[index].session);
      });
      nonMembers.forEach((variable, index) => {
        const value = nonMemberValues[index];
        if (value !== undefined) environment[variable] = value;
      });
      return {
        members,
        nonMemberState,
        identityCase: identityCaseOf(members),
        environment,
        expected: expectedIdentity(members, sessions),
      };
    });
}
