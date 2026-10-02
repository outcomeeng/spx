import {
  authoredText,
  externalValue,
  joinTerminalText,
  jsonDocument,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";

import { AGENT_SESSION_LABEL } from "../protocol";
import type { AgentSearchResult } from "./results";

export function renderAgentSearchJson(results: readonly AgentSearchResult[]): TerminalText {
  return jsonDocument(results, 2);
}

export function renderAgentSearchList(results: readonly AgentSearchResult[]): TerminalText {
  if (results.length === 0) {
    return authoredText("No matching agent sessions found.");
  }
  return joinTerminalText(
    authoredText("\n"),
    results.map((result) => {
      const updatedAt = result.updatedAt ?? new Date(result.modifiedAtMs).toISOString();
      return terminal`${externalValue(updatedAt)} ${authoredText(AGENT_SESSION_LABEL[result.agent])} ${
        externalValue(result.sessionId)
      } ${externalValue(result.cwd)}`;
    }),
  );
}
