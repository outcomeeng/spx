import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";

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
      // A stored timestamp is read from the agent's own transcript, while the fallback is one this
      // product composes from a numeric mtime, so each branch states where its value came from —
      // the same split the resume listing makes for the timestamp it composes.
      const updatedAt = result.updatedAt === null
        ? authoredText(new Date(result.modifiedAtMs).toISOString())
        : externalValue(result.updatedAt);
      return terminal`${updatedAt} ${authoredText(AGENT_SESSION_LABEL[result.agent])} ${
        externalValue(result.sessionId)
      } ${externalValue(result.cwd)}`;
    }),
  );
}
