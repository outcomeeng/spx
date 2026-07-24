import { type TerminalText, authoredText, externalValue, joinTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

import { AGENT_RESUME_TEXT, AGENT_SESSION_LABEL } from "../protocol";
import type { AgentSearchResult } from "./results";

/**
 * The `--json` channel is machine-destined: its safety contract is JSON
 * validity, which `JSON.stringify` supplies by escaping control bytes inside
 * string values. Escaping the serialized document again would corrupt it for
 * the consumers that parse it, so the serializer is the escaping boundary here.
 */
export function renderAgentSearchJson(results: readonly AgentSearchResult[]): TerminalText {
  return authoredText(JSON.stringify(results, null, 2));
}

export function renderAgentSearchList(results: readonly AgentSearchResult[]): TerminalText {
  if (results.length === 0) {
    return authoredText(AGENT_RESUME_TEXT.NO_MATCHES);
  }
  return joinTerminalText(
    AGENT_RESUME_TEXT.ROW_SEPARATOR,
    results.map((result) => {
      const updatedAt = result.updatedAt ?? new Date(result.modifiedAtMs).toISOString();
      return terminal`${externalValue(updatedAt)} ${
        authoredText(AGENT_SESSION_LABEL[result.agent])
      } ${externalValue(result.sessionId)} ${externalValue(result.cwd)}`;
    }),
  );
}
