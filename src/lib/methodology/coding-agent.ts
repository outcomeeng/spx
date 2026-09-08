/**
 * The coding agents spx ships methodology trees for, named as the plugins
 * repository builds them. The shipped layout and the fetch share this one
 * vocabulary; harness-level agent identities map onto it at the interface
 * boundary that reads them.
 *
 * @module lib/methodology/coding-agent
 */

export const METHODOLOGY_CODING_AGENT = {
  CLAUDE: "claude",
  CODEX: "codex",
} as const;

export type MethodologyCodingAgent = (typeof METHODOLOGY_CODING_AGENT)[keyof typeof METHODOLOGY_CODING_AGENT];

/** Every coding agent the shipped layout carries, in code-unit order. */
export const METHODOLOGY_CODING_AGENTS: readonly MethodologyCodingAgent[] = [
  METHODOLOGY_CODING_AGENT.CLAUDE,
  METHODOLOGY_CODING_AGENT.CODEX,
];

export function isMethodologyCodingAgent(value: string): value is MethodologyCodingAgent {
  return (METHODOLOGY_CODING_AGENTS as readonly string[]).includes(value);
}
