/**
 * Pure model for the interactive session picker.
 *
 * Holds the candidate set, the filter query, and the selected index, and
 * reduces key actions to the next state. This module is renderer-agnostic: it
 * imports no React, Ink, or terminal API, so it verifies as a pure function and
 * a non-terminal interface reuses it.
 *
 * @module session/pick-model
 */

import { sortSessions } from "./list";
import { CLAIMABLE_STATUS, type Session } from "./types";

/** The single character that marks a truncated string. */
export const ELLIPSIS = "…";

/**
 * Truncates `text` to at most `max` characters, appending a single ellipsis
 * when it overflows. Returns the input unchanged when it already fits, the
 * empty string for a non-positive width, and just the ellipsis at width 1.
 * Renderer-agnostic so the picker's row layout verifies without a terminal.
 */
export function truncateToWidth(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  if (max === 1) return ELLIPSIS;
  return text.slice(0, max - 1) + ELLIPSIS;
}

/** The action a key resolves to. */
export const PICKER_ACTION = {
  MOVE: "move",
  FILTER_APPEND: "filter-append",
  FILTER_DELETE: "filter-delete",
  CLAIM: "claim",
  CANCEL: "cancel",
} as const;

export type PickerAction =
  | { type: typeof PICKER_ACTION.MOVE; delta: number }
  | { type: typeof PICKER_ACTION.FILTER_APPEND; char: string }
  | { type: typeof PICKER_ACTION.FILTER_DELETE }
  | { type: typeof PICKER_ACTION.CLAIM }
  | { type: typeof PICKER_ACTION.CANCEL };

/**
 * A key event decoupled from any terminal library's representation. The fields
 * mirror the boolean key flags a terminal input layer exposes; the descriptor
 * adapts its library's key object to this shape so the model never imports one.
 */
export interface PickerKey {
  /** The printable characters of the key, empty for a pure control key. */
  input: string;
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
}

/** The picker's full state: its candidates, the live query, and the cursor. */
export interface PickerState {
  readonly candidates: readonly Session[];
  readonly query: string;
  readonly selectedIndex: number;
}

/**
 * Builds the ordered candidate set from a session pool: only `todo` sessions,
 * ordered by priority then recency as `sortSessions` orders them.
 */
export function buildCandidates(sessions: readonly Session[]): Session[] {
  const claimable = sessions.filter((session) => session.status === CLAIMABLE_STATUS);
  return sortSessions(claimable);
}

/**
 * Returns the candidates whose identifier, goal, or next step contains the
 * query (case-insensitive), preserving candidate order. An empty query matches
 * every candidate.
 */
export function filterCandidates(candidates: readonly Session[], query: string): Session[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...candidates];
  }
  return candidates.filter((session) => {
    const haystack = `${session.id}\n${session.metadata.goal}\n${session.metadata.next_step}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/** The candidates visible under the current query, in candidate order. */
export function visibleCandidates(state: PickerState): Session[] {
  return filterCandidates(state.candidates, state.query);
}

/** The currently selected session, or null when the visible set is empty. */
export function selectedSession(state: PickerState): Session | null {
  const visible = visibleCandidates(state);
  return visible[state.selectedIndex] ?? null;
}

/** The initial picker state for a session pool: full candidates, no query, top selected. */
export function initialPickerState(sessions: readonly Session[]): PickerState {
  return { candidates: buildCandidates(sessions), query: "", selectedIndex: 0 };
}

/**
 * Resolves a key event to the action it performs, or null when the key is
 * inert. Arrow keys move the selection, Enter claims, Esc cancels, Backspace or
 * Delete removes the last query character, and any other printable input
 * appends to the query.
 */
export function keyToAction(key: PickerKey): PickerAction | null {
  if (key.downArrow) return { type: PICKER_ACTION.MOVE, delta: 1 };
  if (key.upArrow) return { type: PICKER_ACTION.MOVE, delta: -1 };
  if (key.return) return { type: PICKER_ACTION.CLAIM };
  if (key.escape) return { type: PICKER_ACTION.CANCEL };
  if (key.backspace || key.delete) return { type: PICKER_ACTION.FILTER_DELETE };
  if (key.input.length > 0) return { type: PICKER_ACTION.FILTER_APPEND, char: key.input };
  return null;
}

/** Clamps an index into the visible range `[0, max(0, count - 1)]`. */
function clampIndex(index: number, count: number): number {
  const upper = Math.max(0, count - 1);
  if (index < 0) return 0;
  if (index > upper) return upper;
  return index;
}

/**
 * Reduces an action to the next picker state. MOVE shifts the selection within
 * the visible range; FILTER_APPEND and FILTER_DELETE rewrite the query and
 * re-clamp the selection to the new visible count; CLAIM and CANCEL are
 * terminal effects the renderer handles and leave the state unchanged.
 */
export function reducePicker(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case PICKER_ACTION.MOVE: {
      const count = visibleCandidates(state).length;
      return { ...state, selectedIndex: clampIndex(state.selectedIndex + action.delta, count) };
    }
    case PICKER_ACTION.FILTER_APPEND: {
      const query = state.query + action.char;
      const count = filterCandidates(state.candidates, query).length;
      return { ...state, query, selectedIndex: clampIndex(state.selectedIndex, count) };
    }
    case PICKER_ACTION.FILTER_DELETE: {
      const query = state.query.slice(0, -1);
      const count = filterCandidates(state.candidates, query).length;
      return { ...state, query, selectedIndex: clampIndex(state.selectedIndex, count) };
    }
    case PICKER_ACTION.CLAIM:
    case PICKER_ACTION.CANCEL:
      return state;
  }
}
