import { AGENT_SESSION_LABEL } from "../protocol";
import type { AgentSearchResult } from "./results";

export function renderAgentSearchJson(results: readonly AgentSearchResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function renderAgentSearchList(results: readonly AgentSearchResult[]): string {
  if (results.length === 0) {
    return "No matching agent sessions found.";
  }
  return results.map((result) => {
    const updatedAt = result.updatedAt ?? new Date(result.modifiedAtMs).toISOString();
    return `${updatedAt} ${AGENT_SESSION_LABEL[result.agent]} ${result.sessionId} ${result.cwd}`;
  }).join("\n");
}
