import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  AGENT_REGISTRY,
  type AgentModule,
  DEFAULT_METHODOLOGY_BUNDLE,
  defaultMethodologyBundleOf,
  selectMethodologyBundle,
} from "@/lib/agent-environment";
import {
  arbitraryViolatingAgentModule,
  registryWithDefaultMarks,
} from "@testing/generators/agent-environment/agent-registry";
import {
  arbitraryIdentityEnvironmentCase,
  IDENTITY_CASE,
  IDENTITY_NON_MEMBER_STATES,
  identityVariableSubsets,
} from "@testing/generators/agent-environment/identity";
import {
  AGENT_REGISTRY_VIOLATION,
  agentRegistryFindings,
  loadAgentModuleExports,
} from "@testing/harnesses/agent-environment/agent-registry";

describe("registry-lists-agents", () => {
  it("lists every agent module, and each agent module declares its id, one identity variable, its compact default and at most one bundle", async () => {
    const agentModules = await loadAgentModuleExports();

    expect(agentModules.length).toBeGreaterThan(0);
    expect(agentRegistryFindings(AGENT_REGISTRY, agentModules)).toEqual([]);
  });

  it("rejects an agent module the registry does not list", () => {
    fc.assert(
      fc.property(fc.constantFrom(...AGENT_REGISTRY), (agent) => {
        const unlisted: AgentModule = { ...agent };
        const findings = agentRegistryFindings(AGENT_REGISTRY, [...AGENT_REGISTRY, unlisted]);

        expect(findings).toEqual([{ agentModule: unlisted, violation: AGENT_REGISTRY_VIOLATION.UNLISTED }]);
      }),
    );
  });

  it("rejects each agent module that gets a declaration wrong", () => {
    fc.assert(
      fc.property(arbitraryViolatingAgentModule(), ({ registered, violating, violation }) => {
        const registry = AGENT_REGISTRY.map((entry) => (entry === registered ? violating : entry));

        expect(agentRegistryFindings(registry, registry)).toEqual([{ agentModule: violating, violation }]);
      }),
    );
  });
});

describe("one-default-bundle", () => {
  it("marks exactly one agent module's methodology bundle as the default", () => {
    const marked = AGENT_REGISTRY.filter((agent) => agent.defaultMethodologyBundle);

    expect(marked).toHaveLength(1);
    expect(marked[0].methodologyBundle).toBeDefined();
    expect(DEFAULT_METHODOLOGY_BUNDLE).toBe(marked[0].methodologyBundle);
  });

  it("yields no default methodology bundle for a registry that marks none or several", () => {
    const bundled = AGENT_REGISTRY.filter((agent) => agent.methodologyBundle !== undefined);

    expect(defaultMethodologyBundleOf(registryWithDefaultMarks([]))).toBeUndefined();
    expect(defaultMethodologyBundleOf(registryWithDefaultMarks(bundled))).toBeUndefined();
  });

  it("selects the default methodology bundle when two or more registered identity variables are non-empty", () => {
    const several = identityVariableSubsets().filter((members) => members.length > 1);

    fc.assert(
      fc.property(
        fc.constantFrom(...several).chain((members) =>
          fc.constantFrom(...IDENTITY_NON_MEMBER_STATES).chain((state) =>
            arbitraryIdentityEnvironmentCase(members, state)
          )
        ),
        (testCase) => {
          expect(testCase.identityCase).toBe(IDENTITY_CASE.SEVERAL);
          expect(selectMethodologyBundle(testCase.environment)).toBe(DEFAULT_METHODOLOGY_BUNDLE);
        },
      ),
    );
  });
});
