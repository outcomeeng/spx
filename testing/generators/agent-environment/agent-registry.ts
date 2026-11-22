/**
 * Agent registry fixtures.
 *
 * Construct agent modules that break one registry declaration each, from a registered agent
 * module, together with the violation the registry check reports for it.
 */
import * as fc from "fast-check";

import { AGENT_REGISTRY, type AgentModule, DEFAULT_METHODOLOGY_BUNDLE } from "@/lib/agent-environment";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  AGENT_REGISTRY_VIOLATION,
  type AgentRegistryViolation,
} from "@testing/harnesses/agent-environment/agent-registry";

export interface ViolatingAgentModule {
  readonly registered: AgentModule;
  readonly violating: unknown;
  readonly violation: AgentRegistryViolation;
}

const BLANK_VALUES = ["", " ", "\t"] as const;

function violatingModules(agent: AgentModule, word: string): readonly Omit<ViolatingAgentModule, "registered">[] {
  return [
    { violation: AGENT_REGISTRY_VIOLATION.AGENT_ID, violating: { ...agent, id: BLANK_VALUES[0] } },
    {
      violation: AGENT_REGISTRY_VIOLATION.IDENTITY_VARIABLE,
      violating: { ...agent, identityVariable: [agent.identityVariable, word] },
    },
    {
      violation: AGENT_REGISTRY_VIOLATION.IDENTITY_VARIABLE,
      violating: { ...agent, identityVariable: BLANK_VALUES[1] },
    },
    {
      violation: AGENT_REGISTRY_VIOLATION.COMPACT_STDOUT_DEFAULT,
      violating: { ...agent, compactStdoutDefault: String(agent.compactStdoutDefault) },
    },
    { violation: AGENT_REGISTRY_VIOLATION.METHODOLOGY_BUNDLE, violating: { ...agent, methodologyBundle: word } },
    {
      violation: AGENT_REGISTRY_VIOLATION.METHODOLOGY_BUNDLE,
      violating: { ...agent, methodologyBundle: [DEFAULT_METHODOLOGY_BUNDLE, DEFAULT_METHODOLOGY_BUNDLE] },
    },
  ];
}

/** A registered agent module and a copy of it that breaks exactly one registry declaration. */
export function arbitraryViolatingAgentModule(): fc.Arbitrary<ViolatingAgentModule> {
  return fc
    .tuple(fc.constantFrom(...AGENT_REGISTRY), arbitraryDomainLiteral())
    .chain(([registered, word]) =>
      fc.constantFrom(...violatingModules(registered, word)).map((built) => ({ registered, ...built }))
    );
}

/** The registry with the default-bundle mark carried by exactly the given agent modules. */
export function registryWithDefaultMarks(marked: readonly AgentModule[]): AgentModule[] {
  return AGENT_REGISTRY.map((agent) => ({ ...agent, defaultMethodologyBundle: marked.includes(agent) }));
}
