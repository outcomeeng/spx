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

import { Box, Text, useInput } from "ink";
import { type ReactElement, useState } from "react";

import {
  initialPickerState,
  keyToAction,
  PICKER_ACTION,
  type PickerKey,
  reducePicker,
  selectedSession,
  visibleCandidates,
} from "@/domains/session/pick-model";
import { DEFAULT_PRIORITY, type Session, SESSION_PRIORITY, type SessionPriority } from "@/domains/session/types";

/** The empty-state line shown when no claimable session matches. */
export const SESSION_PICKER_EMPTY_TEXT = "No claimable sessions.";

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

/** One session row, marked when selected and colored by priority. */
function SessionRow({ session, selected }: { readonly session: Session; readonly selected: boolean }): ReactElement {
  const priority = session.metadata.priority;
  const marker = selected ? "❯" : " ";
  const badge = priority === DEFAULT_PRIORITY ? "" : ` [${priority}]`;
  return (
    <Text color={selected ? "cyan" : undefined}>
      {marker} {session.id}
      <Text color={PRIORITY_COLOR[priority]}>{badge}</Text> {session.metadata.goal}
    </Text>
  );
}

/** The preview pane for the selected session: its goal and next step. */
function PreviewPane({ session }: { readonly session: Session | null }): ReactElement {
  if (session === null) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{SESSION_PICKER_EMPTY_TEXT}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text bold>goal:</Text>
        {session.metadata.goal}
      </Text>
      <Text>
        <Text bold>next:</Text>
        {session.metadata.next_step}
      </Text>
    </Box>
  );
}

/**
 * The interactive picker. Renders the claimable queue with a filter line and a
 * preview pane, moves the selection on the arrow keys, narrows on typed text,
 * claims the selected session on Enter, and cancels on Esc.
 */
export function SessionPicker({ sessions, onClaim, onCancel }: SessionPickerProps): ReactElement {
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
      <Text>
        <Text bold>Pick a session to claim</Text>
        <Text dimColor>(type to filter, ↑↓ to move, ⏎ to claim, esc to cancel)</Text>
      </Text>
      <Text dimColor>filter: {state.query}</Text>
      {visible.length === 0
        ? <Text dimColor>{SESSION_PICKER_EMPTY_TEXT}</Text>
        : visible.map((session, index) => (
          <SessionRow key={session.id} session={session} selected={index === state.selectedIndex} />
        ))}
      <PreviewPane session={selected} />
    </Box>
  );
}
