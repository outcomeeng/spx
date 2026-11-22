/**
 * Agent registry checks: every agent module under the registry's `agents/` directory is listed by
 * the registry, and each declares its agent id, exactly one identity variable, its compact-stdout
 * default, and at most one methodology bundle.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";

const AGENT_MODULES_DIR = fileURLToPath(new URL("../../../src/lib/agent-environment/agents/", import.meta.url));
const TYPESCRIPT_SOURCE_PATTERN = /\.ts$/;

/** What a registry check finds wrong with one agent module. */
export const AGENT_REGISTRY_VIOLATION = {
  UNLISTED: "unlisted",
  AGENT_ID: "agent-id",
  IDENTITY_VARIABLE: "identity-variable",
  COMPACT_STDOUT_DEFAULT: "compact-stdout-default",
  METHODOLOGY_BUNDLE: "methodology-bundle",
} as const;

export type AgentRegistryViolation = (typeof AGENT_REGISTRY_VIOLATION)[keyof typeof AGENT_REGISTRY_VIOLATION];

export interface AgentRegistryFinding {
  readonly agentModule: unknown;
  readonly violation: AgentRegistryViolation;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function field(agentModule: unknown, key: string): unknown {
  return typeof agentModule === "object" && agentModule !== null
    ? (agentModule as Record<string, unknown>)[key]
    : undefined;
}

function declarationViolations(agentModule: unknown): AgentRegistryViolation[] {
  const violations: AgentRegistryViolation[] = [];
  if (!isNonEmptyString(field(agentModule, "id"))) violations.push(AGENT_REGISTRY_VIOLATION.AGENT_ID);
  if (!isNonEmptyString(field(agentModule, "identityVariable"))) {
    violations.push(AGENT_REGISTRY_VIOLATION.IDENTITY_VARIABLE);
  }
  if (typeof field(agentModule, "compactStdoutDefault") !== "boolean") {
    violations.push(AGENT_REGISTRY_VIOLATION.COMPACT_STDOUT_DEFAULT);
  }
  const bundle = field(agentModule, "methodologyBundle");
  if (bundle !== undefined && !(METHODOLOGY_CODING_AGENTS as readonly unknown[]).includes(bundle)) {
    violations.push(AGENT_REGISTRY_VIOLATION.METHODOLOGY_BUNDLE);
  }
  return violations;
}

/**
 * Every violation among the agent modules: a module the registry does not list, and each
 * declaration a listed or unlisted module gets wrong.
 */
export function agentRegistryFindings(
  registry: readonly unknown[],
  agentModules: readonly unknown[],
): AgentRegistryFinding[] {
  const considered = [...new Set([...agentModules, ...registry])];
  return considered.flatMap((agentModule) => [
    ...(registry.includes(agentModule) ? [] : [{ agentModule, violation: AGENT_REGISTRY_VIOLATION.UNLISTED }]),
    ...declarationViolations(agentModule).map((violation) => ({ agentModule, violation })),
  ]);
}

/** Every value the files of the registry's `agents/` directory export, one entry per export. */
export async function loadAgentModuleExports(): Promise<unknown[]> {
  const files = readdirSync(AGENT_MODULES_DIR).filter((entry) => TYPESCRIPT_SOURCE_PATTERN.test(entry));
  const modules = await Promise.all(
    files.map(async (entry) =>
      (await import(pathToFileURL(join(AGENT_MODULES_DIR, entry)).href)) as Record<string, unknown>
    ),
  );
  return modules.flatMap((exports) => Object.values(exports));
}
