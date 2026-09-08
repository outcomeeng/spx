/**
 * Invocation-host reads that identify the coding agent in scope, mapped onto
 * the vocabulary spx's shipped methodology trees use. The reads stay at the
 * CLI-interface boundary; handlers receive the resolved agent as an input.
 *
 * @module interfaces/cli/coding-agent
 */

import { AGENT, type Agent, METHODOLOGY_CODING_AGENT_BY_AGENT } from "@/domains/agent-environment/config";
import { HOOK_SESSION_START_ENV, type HookSessionStartEnv } from "@/domains/hooks/session-start";
import type { MethodologyCodingAgent } from "@/lib/methodology";

/** The shipped-tree coding agent for each harness agent identity. */
export const METHODOLOGY_CODING_AGENT_FOR_HARNESS_AGENT = METHODOLOGY_CODING_AGENT_BY_AGENT;

/**
 * The harness agent the invoking process identifies itself as, following the
 * session-marker precedence the harness-environment descriptor declares: the
 * Codex thread marker first, then either Claude Code marker, else none.
 */
export function resolveInvokingAgent(env: HookSessionStartEnv): Agent | undefined {
  if (env[HOOK_SESSION_START_ENV.CODEX_THREAD_ID]?.trim()) return AGENT.CODEX;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]?.trim()) return AGENT.CLAUDE_CODE;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]?.trim()) return AGENT.CLAUDE_CODE;
  return undefined;
}

/** The invoking agent in the shipped-tree vocabulary, or none when no marker identifies one. */
export function inferInvokingCodingAgent(env: HookSessionStartEnv): MethodologyCodingAgent | undefined {
  const agent = resolveInvokingAgent(env);
  return agent === undefined ? undefined : METHODOLOGY_CODING_AGENT_FOR_HARNESS_AGENT[agent];
}
