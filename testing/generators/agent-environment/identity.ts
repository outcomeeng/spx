/**
 * Agent identity environment generators.
 *
 * Construct the invoking environments the identity rule judges, together with the verdict each
 * construction yields. The construction law is the subset of registered identity variables that
 * holds a value: exactly one member identifies the agent whose module declares it, with the
 * member's value normalized to the safe agent session token as its session id, and none or
 * several identify no agent and no session.
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

/** Whether a member's value is already a safe token or holds characters outside the safe token set. */
export const IDENTITY_MEMBER_VALUE_FORM = {
  SAFE: "safe",
  UNSAFE: "unsafe",
} as const;

export type IdentityMemberValueForm = (typeof IDENTITY_MEMBER_VALUE_FORM)[keyof typeof IDENTITY_MEMBER_VALUE_FORM];

/**
 * The identified agent and session a case expects, or none of either. A member value already in
 * safe-token form expects that value as its session id; a member value holding characters outside
 * the safe token set expects a session id that is a safe token and differs from the trimmed value.
 */
export interface ExpectedAgentIdentity {
  readonly agent?: AgentModule;
  readonly sessionId?: string;
  /** The trimmed member value the session id normalizes, when that value is no safe token. */
  readonly normalizedFrom?: string;
}

export interface IdentityEnvironmentCase {
  readonly members: readonly string[];
  readonly nonMemberState: IdentityNonMemberState;
  readonly identityCase: IdentityCase;
  readonly environment: Readonly<Record<string, string>>;
  readonly expected: ExpectedAgentIdentity;
}

interface MemberValue {
  readonly raw: string;
  readonly form: IdentityMemberValueForm;
  /** The value with its edge whitespace trimmed. */
  readonly trimmed: string;
}

const WHITESPACE_RUN_UNITS = [" ", "\t", "\n"] as const;
const WHITESPACE_RUN_MIN_LENGTH = 1;
const WHITESPACE_RUN_MAX_LENGTH = 4;
const MEMBER_PADDING_MAX_LENGTH = 2;
const UNSAFE_UNITS = ["/", ":", ".", "@", "+", " ", "=", "~"] as const;
const UNSAFE_RUN_MIN_LENGTH = 1;
const UNSAFE_RUN_MAX_LENGTH = 3;

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

function arbitraryUnsafeRun(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...UNSAFE_UNITS),
    minLength: UNSAFE_RUN_MIN_LENGTH,
    maxLength: UNSAFE_RUN_MAX_LENGTH,
  });
}

/** The trimmed body of a member value in the given form: a safe token, or one with an unsafe run inside it. */
function arbitraryMemberBody(form: IdentityMemberValueForm): fc.Arbitrary<string> {
  switch (form) {
    case IDENTITY_MEMBER_VALUE_FORM.SAFE:
      return arbitraryDomainLiteral();
    case IDENTITY_MEMBER_VALUE_FORM.UNSAFE:
      return fc
        .tuple(arbitraryDomainLiteral(), arbitraryUnsafeRun(), arbitraryDomainLiteral())
        .map(([head, unsafe, tail]) => `${head}${unsafe}${tail}`);
  }
}

/** A member value in the given form, or in either form when none is given, padded with whitespace the rule trims. */
function arbitraryMemberValue(memberForm?: IdentityMemberValueForm): fc.Arbitrary<MemberValue> {
  const forms = memberForm === undefined ? Object.values(IDENTITY_MEMBER_VALUE_FORM) : [memberForm];
  return fc.constantFrom(...forms).chain((form) =>
    fc
      .tuple(arbitraryWhitespaceRun(0), arbitraryMemberBody(form), arbitraryWhitespaceRun(0))
      .filter(([before, , after]) =>
        before.length <= MEMBER_PADDING_MAX_LENGTH && after.length <= MEMBER_PADDING_MAX_LENGTH
      )
      .map(([before, trimmed, after]) => ({ raw: `${before}${trimmed}${after}`, form, trimmed }))
  );
}

function expectedIdentity(members: readonly string[], values: ReadonlyMap<string, MemberValue>): ExpectedAgentIdentity {
  if (members.length !== 1) return {};
  const [only] = members;
  const agent = AGENT_REGISTRY.find((entry) => entry.identityVariable === only);
  const value = values.get(only);
  if (value === undefined) return { agent };
  return value.form === IDENTITY_MEMBER_VALUE_FORM.SAFE
    ? { agent, sessionId: value.trimmed }
    : { agent, normalizedFrom: value.trimmed };
}

/**
 * One invoking environment for a subset: each member holds a generated session value in either
 * form, and each other registered identity variable reads as the given non-member state.
 */
export function arbitraryIdentityEnvironmentCase(
  members: readonly string[],
  nonMemberState: IdentityNonMemberState,
  memberForm?: IdentityMemberValueForm,
): fc.Arbitrary<IdentityEnvironmentCase> {
  const nonMembers = REGISTERED_IDENTITY_VARIABLES.filter((variable) => !members.includes(variable));
  return fc
    .tuple(
      fc.tuple(...members.map(() => arbitraryMemberValue(memberForm))),
      fc.tuple(...nonMembers.map(() => arbitraryNonMemberValue(nonMemberState))),
    )
    .map(([memberValues, nonMemberValues]) => {
      const environment: Record<string, string> = {};
      const values = new Map<string, MemberValue>();
      members.forEach((variable, index) => {
        environment[variable] = memberValues[index].raw;
        values.set(variable, memberValues[index]);
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
        expected: expectedIdentity(members, values),
      };
    });
}
