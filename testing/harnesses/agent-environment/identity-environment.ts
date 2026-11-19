/**
 * Agent identity environment isolation.
 *
 * The identity rule reads four variables an invoking agent sets for itself. A test that runs in a
 * host that is itself an agent session inherits one of them, so every test that depends on the
 * rule's verdict states all four. This harness owns that statement for the worker's own process
 * environment and for a child process's environment, and restores what it changed.
 */
import { AGENT_IDENTITY_VARIABLE, type AgentIdentityVariable } from "@/domains/agent-environment/config";

export type AgentIdentityValues = Readonly<Partial<Record<AgentIdentityVariable, string>>>;

/** An active isolation of the worker's identity variables. */
export interface AgentIdentityIsolation {
  /** States all four identity variables again: the given values set, every other variable deleted. */
  set(values: AgentIdentityValues): void;
  /** Restores every identity variable to the state it held before the isolation began. */
  restore(): void;
}

const AGENT_IDENTITY_VARIABLES: readonly AgentIdentityVariable[] = Object.values(AGENT_IDENTITY_VARIABLE);
const UNSET_IDENTITY_VALUE = "";

function applyIdentityValues(values: AgentIdentityValues): void {
  for (const variable of AGENT_IDENTITY_VARIABLES) {
    const value = values[variable];
    if (value === undefined) {
      delete process.env[variable];
    } else {
      process.env[variable] = value;
    }
  }
}

/**
 * A child-process environment that states every identity variable: the given values, every other
 * variable empty so an inherited value cannot reach the child.
 */
export function isolatedAgentIdentityEnvironment(values: AgentIdentityValues = {}): Record<string, string> {
  return Object.fromEntries(
    AGENT_IDENTITY_VARIABLES.map((variable) => [variable, values[variable] ?? UNSET_IDENTITY_VALUE]),
  );
}

/**
 * Begins isolating the worker's process environment: every identity variable is deleted until
 * `set` states others, and `restore` returns each variable to the state it held before.
 */
export function beginAgentIdentityIsolation(values: AgentIdentityValues = {}): AgentIdentityIsolation {
  const prior = new Map<AgentIdentityVariable, string | undefined>(
    AGENT_IDENTITY_VARIABLES.map((variable) => [variable, process.env[variable]]),
  );
  applyIdentityValues(values);
  return {
    set: applyIdentityValues,
    restore(): void {
      for (const [variable, value] of prior) {
        if (value === undefined) {
          delete process.env[variable];
        } else {
          process.env[variable] = value;
        }
      }
    },
  };
}

/**
 * Runs the callback with the worker's process environment stating every identity variable, and
 * restores each variable when the callback returns or throws.
 */
export async function withAgentIdentityEnvironment<T>(
  values: AgentIdentityValues,
  callback: () => Promise<T> | T,
): Promise<T> {
  const isolation = beginAgentIdentityIsolation(values);
  try {
    return await callback();
  } finally {
    isolation.restore();
  }
}
