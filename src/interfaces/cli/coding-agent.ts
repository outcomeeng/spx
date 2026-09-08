/**
 * Invocation-host reads that identify the coding agent in scope, mapped onto
 * the vocabulary spx's shipped methodology trees use. The reads stay at the
 * CLI-interface boundary; handlers receive the resolved agent as an input.
 *
 * @module interfaces/cli/coding-agent
 */

import { METHODOLOGY_CODING_AGENT_BY_AGENT } from "@/domains/agent-environment/config";
import { HOOK_SESSION_START_ENV, type HookSessionStartEnv } from "@/domains/hooks/session-start";
import { METHODOLOGY_CODING_AGENT, type MethodologyCodingAgent } from "@/lib/methodology/coding-agent";

/** The shipped-tree coding agent for each harness agent identity. */
export const METHODOLOGY_CODING_AGENT_FOR_HARNESS_AGENT = METHODOLOGY_CODING_AGENT_BY_AGENT;

/**
 * The coding agent the invoking process identifies itself as, following the
 * session-marker precedence the harness-environment descriptor declares:
 * Codex first, then Claude Code, else none.
 */
export function inferInvokingCodingAgent(env: HookSessionStartEnv): MethodologyCodingAgent | undefined {
  if (env[HOOK_SESSION_START_ENV.CODEX_THREAD_ID]?.trim()) return METHODOLOGY_CODING_AGENT.CODEX;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]?.trim()) return METHODOLOGY_CODING_AGENT.CLAUDE;
  if (env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]?.trim()) return METHODOLOGY_CODING_AGENT.CLAUDE;
  return undefined;
}
