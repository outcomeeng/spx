import { describe, expect, it } from "vitest";

import { AGENT_IDENTITY_KIND, AGENT_IDENTITY_VARIABLE, resolveAgentIdentity } from "@/domains/agent-environment/config";

function byCodeUnit(left: string, right: string): number {
  return left.localeCompare(right);
}

function subsetsOf<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((subsets, item) => [...subsets, ...subsets.map((subset) => [...subset, item])], [[]]);
}

describe("agent identification over every subset of the identity variables", () => {
  // The agent each identity variable names, stated independently of the source mapping.
  const expectedAgentByVariable: Readonly<Record<string, string>> = {
    CLAUDE_CODE_SESSION_ID: "claudeCode",
    CODEX_THREAD_ID: "codex",
    ANTIGRAVITY_CONVERSATION_ID: "agy",
    PI_SESSION_ID: "pi",
  };
  const hookExportNoise: Readonly<Record<string, string>> = {
    CLAUDE_SESSION_ID: "hook-exported-session",
    CLAUDE_ENV_FILE: "/tmp/hook-env-file",
  };
  const identityVariables = Object.values(AGENT_IDENTITY_VARIABLE);

  it("covers all sixteen subsets of the four source-owned identity variables", () => {
    expect(identityVariables).toHaveLength(4);
    expect(subsetsOf(identityVariables)).toHaveLength(16);
  });

  for (const subset of subsetsOf(identityVariables)) {
    const label = subset.length === 0 ? "none" : subset.join("+");
    for (const noise of [{}, hookExportNoise]) {
      const noiseLabel = Object.keys(noise).length === 0 ? "without" : "with";
      it(`maps ${label} ${noiseLabel} hook exports to the identity rule's verdict`, () => {
        const env: Record<string, string> = { ...noise };
        for (const variable of subset) env[variable] = `session-of-${variable.toLowerCase()}`;
        // A whitespace-only value counts as unset.
        for (const variable of identityVariables.filter((name) => !subset.includes(name))) env[variable] = "  ";

        const identity = resolveAgentIdentity(env);

        if (subset.length === 0) {
          expect(identity).toEqual({ kind: AGENT_IDENTITY_KIND.NONE });
        } else if (subset.length === 1) {
          const [only] = subset;
          expect(identity).toEqual({
            kind: AGENT_IDENTITY_KIND.IDENTIFIED,
            agent: expectedAgentByVariable[only],
            sessionId: `session-of-${only.toLowerCase()}`,
          });
        } else {
          expect(identity.kind).toBe(AGENT_IDENTITY_KIND.AMBIGUOUS);
          if (identity.kind !== AGENT_IDENTITY_KIND.AMBIGUOUS) return;
          expect([...identity.variables].sort(byCodeUnit)).toEqual([...subset].sort(byCodeUnit));
        }
      });
    }
  }
});
