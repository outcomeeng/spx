import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import { sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  type AgentSearchMatchReason,
  type AgentSearchSessionKind,
} from "../protocol";

/** The line terminators a locator needle can never carry: the locator matches within one line. */
export const AGENT_SEARCH_NEEDLE_LINE_TERMINATORS = /[\r\n]/u;

/** A selector value the locator can search for: non-empty and free of line terminators. */
export function isAgentSearchNeedle(value: string): boolean {
  return value.length > 0 && !AGENT_SEARCH_NEEDLE_LINE_TERMINATORS.test(value);
}

/** The selectors whose value reaches the store only as a locator needle. */
export const AGENT_SEARCH_NEEDLE_SELECTORS = [
  AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
  AGENT_SEARCH_MATCH_REASON.CONTAINS,
  AGENT_SEARCH_MATCH_REASON.SESSION_ID,
  AGENT_SEARCH_MATCH_REASON.BRANCH,
] as const;

export type AgentSearchNeedleSelector = (typeof AGENT_SEARCH_NEEDLE_SELECTORS)[number];

export class AgentSearchNeedleError extends Error {
  constructor(readonly selector: AgentSearchNeedleSelector, value: string) {
    super(
      `agent search ${selector} must be a non-empty single-line value: ${sanitizeCliArgument(value)}`,
    );
    this.name = "AgentSearchNeedleError";
  }
}

function requireNeedle(selector: AgentSearchNeedleSelector, value: string): string {
  if (!isAgentSearchNeedle(value)) {
    throw new AgentSearchNeedleError(selector, value);
  }
  return value;
}

export interface AgentSearchContentNeedle {
  readonly reason: AgentSearchMatchReason;
  readonly value: string;
}

export interface AgentSearchQuery {
  readonly contentNeedles: readonly AgentSearchContentNeedle[];
  readonly sessionId: string | null;
  readonly branch: string | null;
  readonly agent: AgentSearchSessionKind | null;
  readonly includeAll: boolean;
  readonly sinceMs: number | null;
  readonly limit: number;
}

export interface AgentSearchQueryOptions {
  readonly pickupId?: string;
  readonly contains?: string;
  readonly sessionId?: string;
  readonly branch?: string;
  readonly agent?: AgentSearchSessionKind;
  readonly all?: boolean;
  readonly sinceMs?: number;
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
      value: pickupIdSearchLiteral(requireNeedle(AGENT_SEARCH_MATCH_REASON.PICKUP_ID, options.pickupId)),
    });
  }
  if (options.contains !== undefined) {
    contentNeedles.push({
      reason: AGENT_SEARCH_MATCH_REASON.CONTAINS,
      value: requireNeedle(AGENT_SEARCH_MATCH_REASON.CONTAINS, options.contains),
    });
  }
  return {
    contentNeedles,
    sessionId: options.sessionId === undefined
      ? null
      : requireNeedle(AGENT_SEARCH_MATCH_REASON.SESSION_ID, options.sessionId),
    branch: options.branch === undefined ? null : requireNeedle(AGENT_SEARCH_MATCH_REASON.BRANCH, options.branch),
    agent: options.agent ?? null,
    includeAll: options.all === true,
    sinceMs: options.sinceMs ?? null,
    limit: options.limit ?? AGENT_SEARCH_DEFAULT_LIMIT,
  };
}

export function hasSearchSelector(query: AgentSearchQuery): boolean {
  return query.contentNeedles.length > 0 || query.sessionId !== null || query.branch !== null || query.agent !== null;
}
