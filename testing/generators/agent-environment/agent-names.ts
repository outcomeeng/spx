/**
 * Agent-names rule fixtures.
 *
 * Construct source files that break the agent-names rule, each holding one string literal exactly
 * equal to a registered agent id or to a variable name an agent module declares, and source files
 * that mention such a name only where the rule does not look.
 */
import * as fc from "fast-check";

import { AGENT_DECLARED_VARIABLES, REGISTERED_AGENT_IDS } from "@/lib/agent-environment";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  AGENT_NAMES_AGENT_MODULES_DIR,
  AGENT_NAMES_METHODOLOGY_DIR,
  AGENT_NAMES_REGISTRY_MODULE,
  AGENT_NAMES_SOURCE_ROOT,
  AGENT_NAMES_TRANSITIONAL_ALLOWLIST,
  type AgentNamesSourceFile,
} from "@testing/harnesses/agent-environment/agent-names";

/** Every name the rule rejects as a literal: the registered agent ids and the declared variable names. */
export const AGENT_NAMES: readonly string[] = [...REGISTERED_AGENT_IDS, ...AGENT_DECLARED_VARIABLES];

/** Where a violating fixture holds the name. */
export const AGENT_NAME_LITERAL_CONTEXT = {
  CONSTANT: "constant",
  TEMPLATE: "template",
  PROPERTY_KEY: "property-key",
  ARGUMENT: "argument",
  DYNAMIC_IMPORT: "dynamic-import",
  EXPORT_SPECIFIER: "export-specifier",
} as const;

export type AgentNameLiteralContext = (typeof AGENT_NAME_LITERAL_CONTEXT)[keyof typeof AGENT_NAME_LITERAL_CONTEXT];

export const AGENT_NAME_LITERAL_CONTEXTS: readonly AgentNameLiteralContext[] = Object.values(
  AGENT_NAME_LITERAL_CONTEXT,
);

/** Where a non-violating fixture mentions the name. */
export const AGENT_NAME_EXEMPT_PLACEMENT = {
  LINE_COMMENT: "line-comment",
  BLOCK_COMMENT: "block-comment",
  IMPORT_SPECIFIER: "import-specifier",
  SUPERSTRING: "superstring",
  REGISTRY_MODULE: "registry-module",
  AGENT_MODULE: "agent-module",
  METHODOLOGY: "methodology",
  ALLOWLISTED: "allowlisted",
  OUTSIDE_SOURCE: "outside-source",
} as const;

export type AgentNameExemptPlacement = (typeof AGENT_NAME_EXEMPT_PLACEMENT)[keyof typeof AGENT_NAME_EXEMPT_PLACEMENT];

export const AGENT_NAME_EXEMPT_PLACEMENTS: readonly AgentNameExemptPlacement[] = Object.values(
  AGENT_NAME_EXEMPT_PLACEMENT,
);

export interface AgentNameFixture {
  readonly name: string;
  readonly file: AgentNamesSourceFile;
}

const TYPESCRIPT_EXTENSION = ".ts";
const OUTSIDE_SOURCE_ROOT = "testing";

function sourcePath(directory: string, stem: string): string {
  return `${directory}${stem}${TYPESCRIPT_EXTENSION}`;
}

function violatingText(context: AgentNameLiteralContext, name: string, identifier: string): string {
  switch (context) {
    case AGENT_NAME_LITERAL_CONTEXT.CONSTANT:
      return `export const ${identifier}: string = "${name}";\n`;
    case AGENT_NAME_LITERAL_CONTEXT.TEMPLATE:
      return `export const ${identifier} = \`${name}\`;\n`;
    case AGENT_NAME_LITERAL_CONTEXT.PROPERTY_KEY:
      return `export const ${identifier} = { "${name}": true };\n`;
    case AGENT_NAME_LITERAL_CONTEXT.ARGUMENT:
      return `export function ${identifier}(env: Record<string, string>): string | undefined {\n  return env["${name}"];\n}\n`;
    case AGENT_NAME_LITERAL_CONTEXT.DYNAMIC_IMPORT:
      return `export const ${identifier} = () => import("${name}");\n`;
    case AGENT_NAME_LITERAL_CONTEXT.EXPORT_SPECIFIER:
      return `export * from "${name}";\n`;
  }
}

function exemptFile(placement: AgentNameExemptPlacement, name: string, stem: string): AgentNamesSourceFile {
  const literal = `export const ${stem.replaceAll("-", "_")}: string = "${name}";\n`;
  const scopedPath = sourcePath(`${AGENT_NAMES_SOURCE_ROOT}/`, stem);
  switch (placement) {
    case AGENT_NAME_EXEMPT_PLACEMENT.LINE_COMMENT:
      return { path: scopedPath, text: `// ${name}\nexport const value = 1;\n` };
    case AGENT_NAME_EXEMPT_PLACEMENT.BLOCK_COMMENT:
      return { path: scopedPath, text: `/** reads "${name}" */\nexport const value = 1;\n` };
    case AGENT_NAME_EXEMPT_PLACEMENT.IMPORT_SPECIFIER:
      return { path: scopedPath, text: `import value from "${name}";\nexport { value };\n` };
    case AGENT_NAME_EXEMPT_PLACEMENT.SUPERSTRING:
      return { path: scopedPath, text: `export const value = "${name}-${stem}";\n` };
    case AGENT_NAME_EXEMPT_PLACEMENT.REGISTRY_MODULE:
      return { path: AGENT_NAMES_REGISTRY_MODULE, text: literal };
    case AGENT_NAME_EXEMPT_PLACEMENT.AGENT_MODULE:
      return { path: sourcePath(AGENT_NAMES_AGENT_MODULES_DIR, stem), text: literal };
    case AGENT_NAME_EXEMPT_PLACEMENT.METHODOLOGY:
      return { path: sourcePath(AGENT_NAMES_METHODOLOGY_DIR, stem), text: literal };
    case AGENT_NAME_EXEMPT_PLACEMENT.ALLOWLISTED:
      return { path: AGENT_NAMES_TRANSITIONAL_ALLOWLIST[0], text: literal };
    case AGENT_NAME_EXEMPT_PLACEMENT.OUTSIDE_SOURCE:
      return { path: sourcePath(`${OUTSIDE_SOURCE_ROOT}/`, stem), text: literal };
  }
}

/** A source file under `src/`, outside every exemption, that holds the name as a literal in the context. */
export function arbitraryViolatingAgentNameFixture(context: AgentNameLiteralContext): fc.Arbitrary<AgentNameFixture> {
  return fc
    .tuple(fc.constantFrom(...AGENT_NAMES), arbitraryDomainLiteral())
    .map(([name, stem]) => ({
      name,
      file: {
        path: sourcePath(`${AGENT_NAMES_SOURCE_ROOT}/domains/${stem}/`, stem),
        text: violatingText(context, name, stem.replaceAll("-", "_")),
      },
    }));
}

/** A source file that mentions the name only in the given placement, which the rule does not judge. */
export function arbitraryExemptAgentNameFixture(placement: AgentNameExemptPlacement): fc.Arbitrary<AgentNameFixture> {
  return fc
    .tuple(fc.constantFrom(...AGENT_NAMES), arbitraryDomainLiteral())
    .map(([name, stem]) => ({ name, file: exemptFile(placement, name, stem) }));
}
