/**
 * Ink component tree for the interactive session picker.
 *
 * Holds no claim or filter logic of its own: it renders the pure picker model
 * from `@/domains/session/pick-model` and routes key events through it,
 * delegating the claim and cancel effects to injected callbacks — the
 * CLI-interface layer's terminal-rendering concern.
 *
 * @module interfaces/cli/session/pick/SessionPicker
 */

import { Box, Text, useInput, useStdout } from "ink";
import { type ReactElement, useState } from "react";

import {
  initialPickerState,
  keyToAction,
  PICKER_ACTION,
  type PickerKey,
  reducePicker,
  selectedSession,
  toSingleLine,
  truncateToWidth,
  visibleCandidates,
} from "@/domains/session/pick-model";
import { DEFAULT_PRIORITY, type Session, SESSION_PRIORITY, type SessionPriority } from "@/domains/session/types";

/** The title rendered on the first line, above the filter and list. */
export const SESSION_PICKER_TITLE = "Pick a session to claim";

/** The empty-state line shown when no claimable session matches. */
export const SESSION_PICKER_EMPTY_TEXT = "No claimable sessions.";

/** The keybinding hint, rendered on its own footer line below the list. */
export const SESSION_PICKER_HINT = "↑/↓ move · type to filter · ⏎ claim · esc cancel";

/** The bold marker on the selected row. */
export const SESSION_PICKER_SELECTED_MARKER = "❯";

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
  /** Invoked with the selected session when the operator claims it. */
  readonly onClaim: (session: Session) => void;
  /** Invoked when the operator cancels without claiming. */
  readonly onCancel: () => void;
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
  // Reserve the fixed-width lead — "{marker} {id}{badge} " — then truncate the goal to what is left.
  const reserved = marker.length + 1 + session.id.length + badge.length + 1;
  // Collapse any line breaks in the goal first, then truncate — a multiline goal must still be one row.
  const goal = truncateToWidth(toSingleLine(session.metadata.goal), Math.max(MIN_GOAL_WIDTH, columns - reserved));
  return (
    <Text wrap="truncate" color={selected ? "cyan" : undefined}>
      {marker} {session.id}
      <Text color={PRIORITY_COLOR[priority]}>{badge}</Text> {goal}
    </Text>
  );
}

/**
 * A `label: value` line. Label and value share one Text node so the separating
 * space sits mid-string and survives Ink's whitespace trimming at span edges.
 */
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
 * a filter line, a preview pane, and a footer hint, moves the selection on the
 * arrow keys, narrows on typed text, claims the selected session on Enter, and
 * cancels on Esc.
 */
export function SessionPicker(
  { sessions, onClaim, onCancel, columns: columnsProp }: SessionPickerProps,
): ReactElement {
  const { stdout } = useStdout();
  const columns = columnsProp ?? stdout?.columns ?? FALLBACK_COLUMNS;
  const [state, setState] = useState(() => initialPickerState(sessions));

  useInput((input, key) => {
    const action = keyToAction(toPickerKey(input, key));
    if (action === null) return;
    if (action.type === PICKER_ACTION.CLAIM) {
      const selected = selectedSession(state);
      if (selected !== null) onClaim(selected);
      return;
    }
    if (action.type === PICKER_ACTION.CANCEL) {
      onCancel();
      return;
    }
    setState((previous) => reducePicker(previous, action));
  });

  const visible = visibleCandidates(state);
  const selected = selectedSession(state);

  return (
    <Box flexDirection="column">
      <Text bold>{SESSION_PICKER_TITLE}</Text>
      <Text dimColor>filter: {state.query}</Text>
      {visible.length === 0
        ? <Text dimColor>{SESSION_PICKER_EMPTY_TEXT}</Text>
        : visible.map((session, index) => (
          <SessionRow key={session.id} session={session} selected={index === state.selectedIndex} columns={columns} />
        ))}
      <PreviewPane session={selected} />
      <Box marginTop={1}>
        <Text dimColor>{SESSION_PICKER_HINT}</Text>
      </Box>
    </Box>
  );
}
