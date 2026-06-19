/**
 * Pure model for the interactive session picker.
 *
 * Holds the candidate set, the live filter query, the selected index, and the
 * mode (browse or filter); reduces key actions to the next state; and resolves
 * the agent command a launch keystroke runs. Renderer-agnostic — no React, Ink,
 * or terminal import — so it verifies as pure functions and a non-terminal
 * interface reuses it.
 *
 * @module session/pick-model
 */

import { sortSessions } from "./list";
import { CLAIMABLE_STATUS, type Session } from "./types";

/** The single character that marks a truncated string. */
export const ELLIPSIS = "…";

/** The agent runtimes a launch keystroke can hand the session to. */
export const PICKER_RUNTIME = {
  CLAUDE: "claude",
  CODEX: "codex",
} as const;

export type PickerRuntime = (typeof PICKER_RUNTIME)[keyof typeof PICKER_RUNTIME];

/** The skill-invocation prefix each runtime uses in its prompt — `/pickup` vs `$pickup`. */
const RUNTIME_SKILL_PREFIX: Record<PickerRuntime, string> = {
  [PICKER_RUNTIME.CLAUDE]: "/",
  [PICKER_RUNTIME.CODEX]: "$",
};

/** A resolved command to hand the terminal to: the runtime binary and its single prompt argument. */
export interface LaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Resolves the agent command that resumes the session named by `reference`: the runtime's binary
 * with a single prompt argument `<prefix>pickup <reference>`, extended by ` --auto-continue` when
 * `autoContinue` is set. The binary name is the runtime id; the prefix is `/` for claude and `$` for
 * codex. The reference is a bare session id (resolved by the agent against its own store) or an
 * absolute session-file path (read by the agent directly) — see {@link pickupReference}.
 */
export function buildPickupCommand(
  runtime: PickerRuntime,
  autoContinue: boolean,
  reference: string,
): LaunchCommand {
  const prompt = `${RUNTIME_SKILL_PREFIX[runtime]}pickup ${reference}${autoContinue ? " --auto-continue" : ""}`;
  return { command: runtime, args: [prompt] };
}

/**
 * The reference the launched agent resolves to the picked session. With the default cwd-scoped store
 * (no `--sessions-dir`) it is the bare session id: the agent resolves the id against its own store,
 * the same store the picker read. With a custom store the agent cannot resolve the id — it scopes to
 * its own cwd, not the picker's `--sessions-dir` — so the reference is the session's absolute file
 * path, which the agent reads directly.
 */
export function pickupReference(session: Session, sessionsDir: string | undefined): string {
  return sessionsDir === undefined ? session.id : session.path;
}

/**
 * Collapses every run of whitespace — including newlines and tabs — to a single
 * space and trims the ends, so a goal carrying line breaks (which the session
 * frontmatter permits) still renders on one row rather than wrapping the list.
 */
export function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Truncates `text` to at most `max` characters, appending a single ellipsis
 * when it overflows. Returns the input unchanged when it already fits, the
 * empty string for a non-positive width, and just the ellipsis at width 1.
 */
export function truncateToWidth(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  if (max === 1) return ELLIPSIS;
  return text.slice(0, max - 1) + ELLIPSIS;
}

/** The picker's two input modes: browsing the list, or editing the filter query. */
export const PICKER_MODE = {
  BROWSE: "browse",
  FILTER: "filter",
} as const;

export type PickerMode = (typeof PICKER_MODE)[keyof typeof PICKER_MODE];

/** The action a key resolves to. */
export const PICKER_ACTION = {
  MOVE: "move",
  ENTER_FILTER: "enter-filter",
  APPLY_FILTER: "apply-filter",
  CLEAR_FILTER: "clear-filter",
  FILTER_APPEND: "filter-append",
  FILTER_DELETE: "filter-delete",
  LAUNCH: "launch",
  QUIT: "quit",
} as const;

export type PickerAction =
  | { type: typeof PICKER_ACTION.MOVE; delta: number }
  | { type: typeof PICKER_ACTION.ENTER_FILTER }
  | { type: typeof PICKER_ACTION.APPLY_FILTER }
  | { type: typeof PICKER_ACTION.CLEAR_FILTER }
  | { type: typeof PICKER_ACTION.FILTER_APPEND; char: string }
  | { type: typeof PICKER_ACTION.FILTER_DELETE }
  | { type: typeof PICKER_ACTION.LAUNCH; runtime: PickerRuntime; autoContinue: boolean }
  | { type: typeof PICKER_ACTION.QUIT };

/** The browse-mode key that opens the filter, and the one that quits. */
const FILTER_KEY = "/";
const QUIT_KEY = "q";

/** Browse-mode launch keystrokes: the printable key to the runtime and auto-continue it launches. */
const LAUNCH_KEYS: Record<string, { runtime: PickerRuntime; autoContinue: boolean }> = {
  c: { runtime: PICKER_RUNTIME.CLAUDE, autoContinue: false },
  C: { runtime: PICKER_RUNTIME.CLAUDE, autoContinue: true },
  x: { runtime: PICKER_RUNTIME.CODEX, autoContinue: false },
  X: { runtime: PICKER_RUNTIME.CODEX, autoContinue: true },
};

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

/** The picker's full state: candidates, the live query, the cursor, and the mode. */
export interface PickerState {
  readonly candidates: readonly Session[];
  readonly query: string;
  readonly selectedIndex: number;
  readonly mode: PickerMode;
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

/** The initial picker state for a session pool: full candidates, no query, top selected, browsing. */
export function initialPickerState(sessions: readonly Session[]): PickerState {
  return { candidates: buildCandidates(sessions), query: "", selectedIndex: 0, mode: PICKER_MODE.BROWSE };
}

/**
 * Resolves a key event to the action it performs in the given mode, or null
 * when the key is inert. In browse mode the arrows move, the filter key opens
 * filtering, the launch keys hand off to a runtime, and the quit key or Esc
 * quits — a printable key that is not bound is ignored. In filter mode every
 * printable key edits the query, so a launch character is filter text, not a
 * launch, while a filter is open.
 */
export function keyToAction(key: PickerKey, mode: PickerMode): PickerAction | null {
  if (key.downArrow) return { type: PICKER_ACTION.MOVE, delta: 1 };
  if (key.upArrow) return { type: PICKER_ACTION.MOVE, delta: -1 };

  if (mode === PICKER_MODE.FILTER) {
    if (key.return) return { type: PICKER_ACTION.APPLY_FILTER };
    if (key.escape) return { type: PICKER_ACTION.CLEAR_FILTER };
    if (key.backspace || key.delete) return { type: PICKER_ACTION.FILTER_DELETE };
    if (key.input.length > 0) return { type: PICKER_ACTION.FILTER_APPEND, char: key.input };
    return null;
  }

  if (key.escape) return { type: PICKER_ACTION.QUIT };
  if (key.input === FILTER_KEY) return { type: PICKER_ACTION.ENTER_FILTER };
  if (key.input === QUIT_KEY) return { type: PICKER_ACTION.QUIT };
  const launch = LAUNCH_KEYS[key.input];
  if (launch !== undefined) {
    return { type: PICKER_ACTION.LAUNCH, runtime: launch.runtime, autoContinue: launch.autoContinue };
  }
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
 * the visible range; ENTER_FILTER/APPLY_FILTER/CLEAR_FILTER switch mode (clear
 * resets the query); FILTER_APPEND and FILTER_DELETE rewrite the query and
 * re-clamp the selection; LAUNCH and QUIT are terminal effects the renderer
 * handles and leave the state unchanged.
 */
export function reducePicker(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case PICKER_ACTION.MOVE: {
      const count = visibleCandidates(state).length;
      return { ...state, selectedIndex: clampIndex(state.selectedIndex + action.delta, count) };
    }
    case PICKER_ACTION.ENTER_FILTER:
      return { ...state, mode: PICKER_MODE.FILTER };
    case PICKER_ACTION.APPLY_FILTER:
      return { ...state, mode: PICKER_MODE.BROWSE };
    case PICKER_ACTION.CLEAR_FILTER: {
      const count = filterCandidates(state.candidates, "").length;
      return { ...state, mode: PICKER_MODE.BROWSE, query: "", selectedIndex: clampIndex(state.selectedIndex, count) };
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
    case PICKER_ACTION.LAUNCH:
    case PICKER_ACTION.QUIT:
      return state;
  }
}
