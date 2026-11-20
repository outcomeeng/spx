/**
 * Agent identity environment generators.
 *
 * Construct the invoking environments the identity rule judges, together with the verdict each
 * construction yields. The construction law is the registry: an environment that sets exactly one
 * identity variable identifies the agent the registry maps that variable to, and an environment
 * that sets none or several identifies nothing.
 */
import * as fc from "fast-check";

import {
  type Agent,
  AGENT_IDENTITY_KIND,
  AGENT_IDENTITY_VARIABLE,
  type AgentIdentity,
  type AgentIdentityVariable,
} from "@/domains/agent-environment/config";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** How a variable that is not a member of the case's non-empty subset reads in the environment. */
export const IDENTITY_NON_MEMBER_STATE = {
  ABSENT: "absent",
  EMPTY: "empty",
  WHITESPACE: "whitespace",
} as const;

export type IdentityNonMemberState = (typeof IDENTITY_NON_MEMBER_STATE)[keyof typeof IDENTITY_NON_MEMBER_STATE];

export const IDENTITY_NON_MEMBER_STATES: readonly IdentityNonMemberState[] = Object.values(IDENTITY_NON_MEMBER_STATE);

/** The hook-export variable that holds the env file a hook appends exports to; it is no identity variable. */
export const HOOK_EXPORT_NOISE_VARIABLE = HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE;

export interface IdentityEnvironmentCaseInput {
  readonly members: readonly AgentIdentityVariable[];
  readonly nonMemberState: IdentityNonMemberState;
  readonly withHookExports: boolean;
}

export interface IdentityEnvironmentCase extends IdentityEnvironmentCaseInput {
  readonly environment: Readonly<Record<string, string>>;
  readonly expected: AgentIdentity;
}

const IDENTITY_VARIABLES: readonly AgentIdentityVariable[] = Object.values(AGENT_IDENTITY_VARIABLE);
const AGENT_BY_IDENTITY_VARIABLE = new Map<string, Agent>(
  (Object.entries(AGENT_IDENTITY_VARIABLE) as [Agent, AgentIdentityVariable][]).map(([agent, variable]) => [
    variable,
    agent,
  ]),
);
const WHITESPACE_RUN_UNITS = [" ", "\t", "\n"] as const;
const WHITESPACE_RUN_MIN_LENGTH = 1;
const WHITESPACE_RUN_MAX_LENGTH = 4;

/** Every subset of the source-owned identity variables, the empty subset first. */
export function identityVariableSubsets(): readonly (readonly AgentIdentityVariable[])[] {
  return IDENTITY_VARIABLES.reduce<AgentIdentityVariable[][]>(
    (subsets, variable) => [...subsets, ...subsets.map((subset) => [...subset, variable])],
    [[]],
  );
}

function arbitraryWhitespaceRun(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...WHITESPACE_RUN_UNITS),
    minLength: WHITESPACE_RUN_MIN_LENGTH,
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
      return arbitraryWhitespaceRun();
  }
}

function expectedIdentity(
  members: readonly AgentIdentityVariable[],
  sessions: ReadonlyMap<string, string>,
): AgentIdentity {
  if (members.length === 0) return { kind: AGENT_IDENTITY_KIND.NONE };
  if (members.length > 1) return { kind: AGENT_IDENTITY_KIND.AMBIGUOUS, variables: members };
  const [only] = members;
  return {
    kind: AGENT_IDENTITY_KIND.IDENTIFIED,
    agent: AGENT_BY_IDENTITY_VARIABLE.get(only) as Agent,
    sessionId: sessions.get(only) as string,
  };
}

/**
 * One invoking environment for the given case input: each member holds a generated session value,
 * each other identity variable reads as the input's non-member state, and the hook-export variable
 * holds a generated path when the input asks for it.
 */
export function arbitraryIdentityEnvironmentCase(
  input: IdentityEnvironmentCaseInput,
): fc.Arbitrary<IdentityEnvironmentCase> {
  const nonMembers = IDENTITY_VARIABLES.filter((variable) => !input.members.includes(variable));
  return fc
    .tuple(
      fc.tuple(...input.members.map(() => arbitraryDomainLiteral())),
      fc.tuple(...nonMembers.map(() => arbitraryNonMemberValue(input.nonMemberState))),
      arbitraryDomainLiteral(),
    )
    .map(([memberValues, nonMemberValues, hookExportValue]) => {
      const sessions = new Map<string, string>(input.members.map((variable, index) => [variable, memberValues[index]]));
      const environment: Record<string, string> = {};
      if (input.withHookExports) environment[HOOK_EXPORT_NOISE_VARIABLE] = hookExportValue;
      for (const [variable, value] of sessions) environment[variable] = value;
      nonMembers.forEach((variable, index) => {
        const value = nonMemberValues[index];
        if (value !== undefined) environment[variable] = value;
      });
      return { ...input, environment, expected: expectedIdentity(input.members, sessions) };
    });
}

/** How a violating registration derives its variable name from a registered identity variable. */
export const UNREGISTERED_VARIABLE_DERIVATION = {
  SUFFIXED: "suffixed",
  PREFIXED: "prefixed",
  LOWERCASED: "lowercased",
} as const;

export type UnregisteredVariableDerivation =
  (typeof UNREGISTERED_VARIABLE_DERIVATION)[keyof typeof UNREGISTERED_VARIABLE_DERIVATION];

export const UNREGISTERED_VARIABLE_DERIVATIONS: readonly UnregisteredVariableDerivation[] = Object.values(
  UNREGISTERED_VARIABLE_DERIVATION,
);

export interface UnregisteredIdentityCase {
  readonly registeredVariable: AgentIdentityVariable;
  readonly unregisteredVariable: string;
  readonly sessionValue: string;
}

function unregisteredVariableName(
  derivation: UnregisteredVariableDerivation,
  registeredVariable: AgentIdentityVariable,
  affix: string,
): string {
  switch (derivation) {
    case UNREGISTERED_VARIABLE_DERIVATION.SUFFIXED:
      return `${registeredVariable}_${affix}`;
    case UNREGISTERED_VARIABLE_DERIVATION.PREFIXED:
      return `${affix}_${registeredVariable}`;
    case UNREGISTERED_VARIABLE_DERIVATION.LOWERCASED:
      return registeredVariable.toLowerCase();
  }
}

/**
 * A violating registration: a session id held under a variable name that is a near miss of a
 * registered identity variable but is not itself registered.
 */
export function arbitraryUnregisteredIdentityCase(
  derivation: UnregisteredVariableDerivation,
): fc.Arbitrary<UnregisteredIdentityCase> {
  return fc
    .tuple(
      fc.constantFrom(...IDENTITY_VARIABLES),
      arbitraryDomainLiteral().map((literal) => literal.toUpperCase()),
      arbitraryDomainLiteral(),
    )
    .map(([registeredVariable, affix, sessionValue]) => ({
      registeredVariable,
      unregisteredVariable: unregisteredVariableName(derivation, registeredVariable, affix),
      sessionValue,
    }))
    .filter(({ unregisteredVariable }) => !IDENTITY_VARIABLES.some((variable) => variable === unregisteredVariable));
}
