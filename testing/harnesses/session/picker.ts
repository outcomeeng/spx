/**
 * Render harness for the interactive session picker.
 *
 * Mounts `SessionPicker` through `ink-testing-library` and exposes a queried
 * view of the rendered frame — rows, the selected row, the preview block, the
 * footer hint — plus semantic key drivers (arrow, type, enter, esc) that write
 * the terminal byte sequence and await Ink's flush. Picker tests query intent
 * ("the row for this id", "the preview goal") instead of splitting and
 * filtering the raw frame string, and the terminal byte constants, the flush
 * delay, and the no-JSX-in-`.ts` `createElement` call live here once.
 *
 * @module session/testing/picker
 */

import { render } from "ink-testing-library";
import { createElement } from "react";

import type { PickerRuntime } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";
import {
  PREVIEW_GOAL_LABEL,
  PREVIEW_NEXT_LABEL,
  SESSION_PICKER_BROWSE_HINT,
  SESSION_PICKER_FILTER_HINT,
  SESSION_PICKER_FILTER_LABEL,
  SESSION_PICKER_SELECTED_MARKER,
  SESSION_PICKER_TITLE,
  SessionPicker,
} from "@/interfaces/cli/session/pick/SessionPicker";

/** Terminal byte sequences for the keys the picker reads. */
const KEY = {
  ARROW_UP: "[A",
  ARROW_DOWN: "[B",
  ENTER: "\r",
  ESCAPE: "",
} as const;

/**
 * ink@7 buffers a lone Escape for `pendingInputFlushDelayMilliseconds` (20ms) to tell a standalone
 * Escape from the start of an escape sequence (an arrow key, say), flushing it as Escape only after
 * the window elapses. A test driving Escape must outwait that window; the margin covers timer jitter.
 */
const INK_ESCAPE_FLUSH_MS = 40;

/** Drains the immediate queue so a synchronously-delivered key and its re-render settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Awaits ink's Escape-disambiguation window, then settles — for the one key the runtime delays. */
async function flushEscape(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, INK_ESCAPE_FLUSH_MS));
  await flush();
}

/** Options for mounting the picker; callbacks default to no-ops. */
export interface RenderPickerOptions {
  readonly sessions: readonly Session[];
  readonly onLaunch?: (session: Session, runtime: PickerRuntime, autoContinue: boolean) => void;
  readonly onQuit?: () => void;
  /** Fixed row width, pinning the truncation input independently of the test terminal. */
  readonly columns?: number;
}

/** The selected session's preview block, with each field's full rendered line. */
export interface PreviewView {
  /** The `goal:` line verbatim, including the label and its separating space. */
  readonly goalLine: string;
  /** The `next:` line verbatim, including the label and its separating space. */
  readonly nextLine: string;
}

/** A queried view over the picker's rendered frame and its key input. */
export interface PickerView {
  /** The full rendered frame. */
  frame(): string;
  /** The title line. */
  titleLine(): string;
  /** The live filter-query line (the label and the current query). */
  filterLine(): string;
  /** Every frame line mentioning the id — one for a rendered session, none when filtered out. */
  rowLinesFor(id: string): string[];
  /** The marked (selected) row, or undefined when no row is selected. */
  selectedRow(): string | undefined;
  /** The preview block for the selected session, or null in the empty state. */
  preview(): PreviewView | null;
  /** The footer hint line — the line carrying the browse or filter hint. */
  footerLine(): string | undefined;
  /** Move the selection down one row. */
  arrowDown(): Promise<void>;
  /** Move the selection up one row. */
  arrowUp(): Promise<void>;
  /** Type the given characters — filter text, or a browse-mode command key (`/`, `c`, `q`, …). */
  type(text: string): Promise<void>;
  /** Press Enter (applies the filter in filter mode). */
  enter(): Promise<void>;
  /** Press Escape (quits in browse mode, clears the filter in filter mode). */
  esc(): Promise<void>;
  /** Tear the mounted app down. */
  unmount(): void;
}

/**
 * Mounts the picker over `sessions` and returns a queried view of the frame.
 */
export function renderPickerView(options: RenderPickerOptions): PickerView {
  const instance = render(
    createElement(SessionPicker, {
      sessions: options.sessions,
      onLaunch: options.onLaunch ?? (() => {}),
      onQuit: options.onQuit ?? (() => {}),
      columns: options.columns,
    }),
  );

  const lines = (): string[] => (instance.lastFrame() ?? "").split("\n");
  const lineStartingWith = (prefix: string): string | undefined =>
    lines().find((line) => line.trimStart().startsWith(prefix));

  const write = async (sequence: string, settle: () => Promise<void> = flush): Promise<void> => {
    instance.stdin.write(sequence);
    await settle();
  };

  return {
    frame: () => instance.lastFrame() ?? "",
    titleLine: () => lines().find((line) => line.includes(SESSION_PICKER_TITLE)) ?? "",
    filterLine: () => lines().find((line) => line.trimStart().startsWith(SESSION_PICKER_FILTER_LABEL)) ?? "",
    rowLinesFor: (id) => lines().filter((line) => line.includes(id)),
    selectedRow: () => lines().find((line) => line.includes(SESSION_PICKER_SELECTED_MARKER)),
    preview: () => {
      const goalLine = lineStartingWith(PREVIEW_GOAL_LABEL);
      const nextLine = lineStartingWith(PREVIEW_NEXT_LABEL);
      return goalLine !== undefined && nextLine !== undefined ? { goalLine, nextLine } : null;
    },
    footerLine: () =>
      lines().find((line) => line.includes(SESSION_PICKER_BROWSE_HINT) || line.includes(SESSION_PICKER_FILTER_HINT)),
    arrowDown: () => write(KEY.ARROW_DOWN),
    arrowUp: () => write(KEY.ARROW_UP),
    type: (text) => write(text),
    enter: () => write(KEY.ENTER),
    esc: () => write(KEY.ESCAPE, flushEscape),
    unmount: () => instance.unmount(),
  };
}
