/**
 * The agent registry: the one list of the coding agents spx supports, and the identity rule over
 * the identity variables their modules declare. Every consumer outside this library imports
 * through this module.
 *
 * @module lib/agent-environment
 */

import { nonEmptyEnvValue, normalizeAgentSessionToken } from "@/domains/session/agent-session";
import type { AgentModule } from "@/lib/agent-environment/agent-module";
import { ANTIGRAVITY_AGENT } from "@/lib/agent-environment/agents/antigravity";
import { CLAUDE_CODE_AGENT } from "@/lib/agent-environment/agents/claude-code";
import { CODEX_AGENT } from "@/lib/agent-environment/agents/codex";
import type { MethodologyCodingAgent } from "@/lib/methodology";

export type { AgentModule } from "@/lib/agent-environment/agent-module";

/** Every agent module, one per coding agent spx supports. */
export const AGENT_REGISTRY: readonly AgentModule[] = [CLAUDE_CODE_AGENT, CODEX_AGENT, ANTIGRAVITY_AGENT];

/** The identity variable each registered agent module declares, in registry order. */
export const REGISTERED_IDENTITY_VARIABLES: readonly string[] = AGENT_REGISTRY.map(
  (agent) => agent.identityVariable,
);

/** The agent id each registered agent module declares, in registry order. */
export const REGISTERED_AGENT_IDS: readonly string[] = AGENT_REGISTRY.map((agent) => agent.id);

/** Every variable name a registered agent module declares: its identity variable and its agent home variable. */
export const AGENT_DECLARED_VARIABLES: readonly string[] = AGENT_REGISTRY.flatMap((agent) =>
  agent.home === undefined ? [agent.identityVariable] : [agent.identityVariable, agent.home.variable]
);

/** The environment the identity rule reads. */
export type AgentIdentityEnvironment = Readonly<Record<string, string | undefined>>;

export const AGENT_IDENTITY_KIND = {
  /** No registered identity variable is non-empty. */
  NONE: "none",
  /** Exactly one registered identity variable is non-empty. */
  IDENTIFIED: "identified",
  /** Two or more registered identity variables are non-empty. */
  AMBIGUOUS: "ambiguous",
} as const;

/** The verdict of the identity rule: at most one agent and one session. */
export type AgentIdentity =
  | { readonly kind: typeof AGENT_IDENTITY_KIND.NONE }
  | {
    readonly kind: typeof AGENT_IDENTITY_KIND.IDENTIFIED;
    readonly agent: AgentModule;
    readonly sessionId: string;
  }
  | {
    readonly kind: typeof AGENT_IDENTITY_KIND.AMBIGUOUS;
    /** The non-empty registered identity variables, in registry order. */
    readonly variables: readonly string[];
  };

/**
 * Identifies the invoking agent and its session. Exactly one non-empty registered identity
 * variable identifies the agent whose module declares it, with that variable's value normalized
 * to the safe agent session token as its session id; none or several identify no agent and no
 * session, and no variable takes precedence over another.
 */
export function resolveAgentIdentity(env: AgentIdentityEnvironment): AgentIdentity {
  const present = AGENT_REGISTRY.flatMap((agent) => {
    const value = nonEmptyEnvValue(env[agent.identityVariable]);
    return value === undefined ? [] : [{ agent, value }];
  });
  if (present.length === 0) return { kind: AGENT_IDENTITY_KIND.NONE };
  if (present.length > 1) {
    return { kind: AGENT_IDENTITY_KIND.AMBIGUOUS, variables: present.map(({ agent }) => agent.identityVariable) };
  }
  const [{ agent, value }] = present;
  return { kind: AGENT_IDENTITY_KIND.IDENTIFIED, agent, sessionId: normalizeAgentSessionToken(value) };
}

/**
 * The default methodology bundle of a registry: the bundle of the one agent module that marks its
 * bundle as the default, or none when no module, several modules, or a module without a bundle
 * carry the mark.
 */
export function defaultMethodologyBundleOf(registry: readonly AgentModule[]): MethodologyCodingAgent | undefined {
  const marked = registry.filter((agent) => agent.defaultMethodologyBundle);
  return marked.length === 1 ? marked[0].methodologyBundle : undefined;
}

function requireDefaultMethodologyBundle(): MethodologyCodingAgent {
  const bundle = defaultMethodologyBundleOf(AGENT_REGISTRY);
  if (bundle === undefined) {
    throw new Error("agent registry must mark exactly one agent module's methodology bundle as the default");
  }
  return bundle;
}

/** The methodology bundle the one agent module marked as the default declares. */
export const DEFAULT_METHODOLOGY_BUNDLE: MethodologyCodingAgent = requireDefaultMethodologyBundle();

/**
 * The methodology bundle for the invoking environment: the identified agent's bundle, the default
 * methodology bundle when two or more registered identity variables are non-empty, and none when
 * no agent is identified or the identified agent declares no bundle.
 */
export function selectMethodologyBundle(env: AgentIdentityEnvironment): MethodologyCodingAgent | undefined {
  const identity = resolveAgentIdentity(env);
  switch (identity.kind) {
    case AGENT_IDENTITY_KIND.NONE:
      return undefined;
    case AGENT_IDENTITY_KIND.AMBIGUOUS:
      return DEFAULT_METHODOLOGY_BUNDLE;
    case AGENT_IDENTITY_KIND.IDENTIFIED:
      return identity.agent.methodologyBundle;
  }
}
