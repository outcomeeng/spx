import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  type AgentSearchMatchReason,
  type AgentSessionKind,
} from "../protocol";

export interface AgentSearchContentNeedle {
  readonly reason: AgentSearchMatchReason;
  readonly value: string;
}

export interface AgentSearchQuery {
  readonly contentNeedles: readonly AgentSearchContentNeedle[];
  readonly sessionId: string | null;
  readonly branch: string | null;
  readonly agent: AgentSessionKind | null;
  readonly includeAll: boolean;
  readonly limit: number;
}

export interface AgentSearchQueryOptions {
  readonly pickupId?: string;
  readonly contains?: string;
  readonly sessionId?: string;
  readonly branch?: string;
  readonly agent?: AgentSessionKind;
  readonly all?: boolean;
  readonly limit?: number;
}

export function pickupIdSearchLiteral(pickupId: string): string {
  return formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, pickupId);
}

export function agentSearchQueryFromOptions(options: AgentSearchQueryOptions): AgentSearchQuery {
  const contentNeedles: AgentSearchContentNeedle[] = [];
  if (options.pickupId !== undefined) {
    contentNeedles.push({
      reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
      value: pickupIdSearchLiteral(options.pickupId),
    });
  }
  if (options.contains !== undefined) {
    contentNeedles.push({ reason: AGENT_SEARCH_MATCH_REASON.CONTAINS, value: options.contains });
  }
  return {
    contentNeedles,
    sessionId: options.sessionId ?? null,
    branch: options.branch ?? null,
    agent: options.agent ?? null,
    includeAll: options.all === true,
    limit: options.limit ?? AGENT_SEARCH_DEFAULT_LIMIT,
  };
}

export function hasSearchSelector(query: AgentSearchQuery): boolean {
  return query.contentNeedles.length > 0 || query.sessionId !== null || query.branch !== null || query.agent !== null;
}
