/**
 * Ink component tree for the interactive session picker.
 *
 * Renders the pure picker model from `@/domains/session/pick-model` and routes
 * key events through it, delegating launch and quit to injected callbacks — the
 * CLI-interface layer's terminal-rendering concern. It performs no claim: a
 * launch keystroke hands the selected session out through `onLaunch`.
 *
 * @module interfaces/cli/session/pick/SessionPicker
 */

import { Box, Text, useInput, useStdout } from "ink";
import { type ReactElement, useState } from "react";

import {
  initialPickerState,
  keyToAction,
  PICKER_ACTION,
  PICKER_MODE,
  type PickerKey,
  type PickerRuntime,
  reducePicker,
  selectedSession,
  toSingleLine,
  truncateToWidth,
  visibleCandidates,
} from "@/domains/session/pick-model";
import { DEFAULT_PRIORITY, type Session, SESSION_PRIORITY, type SessionPriority } from "@/domains/session/types";

/** The title rendered on the first line, above the filter and list. */
export const SESSION_PICKER_TITLE = "Pick a session to launch";

/** The empty-state line shown when no claimable session matches. */
export const SESSION_PICKER_EMPTY_TEXT = "No claimable sessions.";

/** The footer hint while browsing the list. */
export const SESSION_PICKER_BROWSE_HINT = "↑↓ move · / filter · c/C claude · x/X codex · q quit";

/** The footer hint while editing the filter query. */
export const SESSION_PICKER_FILTER_HINT = "type to filter · ↑↓ move · ⏎ apply · esc clear";

/** The bold marker on the selected row. */
export const SESSION_PICKER_SELECTED_MARKER = "❯";

/** The label prefixing the live filter query line. */
export const SESSION_PICKER_FILTER_LABEL = "filter:";

/** Preview-pane field labels (each followed by one space, then the value). */
export const PREVIEW_GOAL_LABEL = "goal:";
export const PREVIEW_NEXT_LABEL = "next:";

/** Terminal width assumed when the output stream reports none. */
const FALLBACK_COLUMNS = 80;
/** Smallest goal width a row keeps after reserving room for marker, id, and badge. */
const MIN_GOAL_WIDTH = 8;

/** Ink color per priority, so the queue's urgency reads at a glance. */
const PRIORITY_COLOR: Record<SessionPriority, string> = {
  [SESSION_PRIORITY.HIGH]: "red",
  [SESSION_PRIORITY.MEDIUM]: "yellow",
  [SESSION_PRIORITY.LOW]: "gray",
};

export interface SessionPickerProps {
  /** The session pool to pick from; the model retains only the claimable ones. */
  readonly sessions: readonly Session[];
  /** Invoked with the selected session, chosen runtime, and auto-continue flag on a launch keystroke. */
  readonly onLaunch: (session: Session, runtime: PickerRuntime, autoContinue: boolean) => void;
  /** Invoked when the operator quits without launching. */
  readonly onQuit: () => void;
  /** Row width override; defaults to the terminal's column count, then `FALLBACK_COLUMNS`. */
  readonly columns?: number;
}

/** Translates Ink's key object into the renderer-agnostic `PickerKey`. */
function toPickerKey(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]): PickerKey {
  return {
    input,
    upArrow: key.upArrow,
    downArrow: key.downArrow,
    return: key.return,
    escape: key.escape,
    backspace: key.backspace,
    delete: key.delete,
  };
}

/**
 * One session row on a single line: the goal is truncated to the width left
 * after the marker, id, and priority badge, so a long goal never wraps.
 */
function SessionRow(
  { session, selected, columns }: { readonly session: Session; readonly selected: boolean; readonly columns: number },
): ReactElement {
  const priority = session.metadata.priority;
  const marker = selected ? SESSION_PICKER_SELECTED_MARKER : " ";
  const badge = priority === DEFAULT_PRIORITY ? "" : ` [${priority}]`;
  const reserved = marker.length + 1 + session.id.length + badge.length + 1;
  const goal = truncateToWidth(toSingleLine(session.metadata.goal), Math.max(MIN_GOAL_WIDTH, columns - reserved));
  return (
    <Text wrap="truncate" color={selected ? "cyan" : undefined}>
      {marker} {session.id}
      <Text color={PRIORITY_COLOR[priority]}>{badge}</Text> {goal}
    </Text>
  );
}

/** A `label: value` line; label and value share one Text so the separating space survives. */
function PreviewField({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return <Text>{`${label} ${value}`}</Text>;
}

/** The preview pane for the selected session: its goal and next step. */
function PreviewPane({ session }: { readonly session: Session | null }): ReactElement {
  if (session === null) {
    return (
      <Box marginTop={1}>
        <Text dimColor>{SESSION_PICKER_EMPTY_TEXT}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <PreviewField label={PREVIEW_GOAL_LABEL} value={session.metadata.goal} />
      <PreviewField label={PREVIEW_NEXT_LABEL} value={session.metadata.next_step} />
    </Box>
  );
}

/**
 * The interactive picker. Renders the claimable queue as single-line rows with
 * a filter line, a preview pane, and a mode-specific footer hint; moves the
 * selection on the arrows, opens filtering on `/`, hands the selected session
 * to a runtime on a launch keystroke, and quits on `q` or Esc.
 */
export function SessionPicker(
  { sessions, onLaunch, onQuit, columns: columnsProp }: SessionPickerProps,
): ReactElement {
  const { stdout } = useStdout();
  const columns = columnsProp ?? stdout?.columns ?? FALLBACK_COLUMNS;
  const [state, setState] = useState(() => initialPickerState(sessions));

  useInput((input, key) => {
    const action = keyToAction(toPickerKey(input, key), state.mode);
    if (action === null) return;
    if (action.type === PICKER_ACTION.LAUNCH) {
      const selected = selectedSession(state);
      if (selected !== null) onLaunch(selected, action.runtime, action.autoContinue);
      return;
    }
    if (action.type === PICKER_ACTION.QUIT) {
      onQuit();
      return;
    }
    setState((previous) => reducePicker(previous, action));
  });

  const visible = visibleCandidates(state);
  const selected = selectedSession(state);
  const hint = state.mode === PICKER_MODE.FILTER ? SESSION_PICKER_FILTER_HINT : SESSION_PICKER_BROWSE_HINT;

  return (
    <Box flexDirection="column">
      <Text bold>{SESSION_PICKER_TITLE}</Text>
      <Text dimColor>{SESSION_PICKER_FILTER_LABEL} {state.query}</Text>
      {visible.length === 0
        ? <Text dimColor>{SESSION_PICKER_EMPTY_TEXT}</Text>
        : visible.map((session, index) => (
          <SessionRow key={session.id} session={session} selected={index === state.selectedIndex} columns={columns} />
        ))}
      <PreviewPane session={selected} />
      <Box marginTop={1}>
        <Text dimColor>{hint}</Text>
      </Box>
    </Box>
  );
}
