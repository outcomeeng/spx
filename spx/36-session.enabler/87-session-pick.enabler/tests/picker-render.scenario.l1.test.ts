/**
 * Picker rendering scenarios.
 *
 * Sessions, widths, goals, and filter needles are sampled from generators; every
 * expectation is derived from the sampled input. Each scenario mounts the picker
 * through the render harness and queries the frame by intent. The picker
 * performs no claim — a launch keystroke is captured through `onLaunch`.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PICKER_RUNTIME, type PickerRuntime } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";
import {
  PREVIEW_GOAL_LABEL,
  PREVIEW_NEXT_LABEL,
  SESSION_PICKER_BROWSE_HINT,
  SESSION_PICKER_EMPTY_TEXT,
  SESSION_PICKER_FILTER_HINT,
} from "@/interfaces/cli/session/pick/SessionPicker";
import {
  arbitraryClaimableSession,
  arbitraryClaimableSessionsSamePriority,
  arbitraryFilterScenario,
  arbitraryGoalWithNewline,
  arbitrarySessionId,
  claimableSession,
} from "@testing/generators/session/session";
import { renderPickerView } from "@testing/harnesses/session/picker";

/** Draw a single value from an arbitrary for an example-based scenario. */
function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

/** A generated terminal width wide enough that short generated goals are not truncated. */
function sampleWidth(): number {
  return sample(fc.integer({ min: 80, max: 120 }));
}

interface LaunchRecord {
  readonly session: Session;
  readonly runtime: PickerRuntime;
  readonly autoContinue: boolean;
}

interface LaunchCase {
  readonly key: string;
  readonly runtime: PickerRuntime;
  readonly autoContinue: boolean;
}

const LAUNCH_CASES: readonly LaunchCase[] = [
  { key: "c", runtime: PICKER_RUNTIME.CLAUDE, autoContinue: false },
  { key: "C", runtime: PICKER_RUNTIME.CLAUDE, autoContinue: true },
  { key: "x", runtime: PICKER_RUNTIME.CODEX, autoContinue: false },
  { key: "X", runtime: PICKER_RUNTIME.CODEX, autoContinue: true },
];

describe("SessionPicker rendering", () => {
  it("lists every claimable session with the newest selected and previewed", () => {
    const sessions = sample(arbitraryClaimableSessionsSamePriority());
    const newest = sessions.reduce((best, session) => (session.id >= best.id ? session : best));
    const view = renderPickerView({ sessions, columns: sampleWidth() });

    for (const session of sessions) {
      expect(view.rowLinesFor(session.id)).toHaveLength(1);
    }
    expect(view.selectedRow()).toContain(newest.id);
    expect(view.preview()?.goalLine).toContain(newest.metadata.goal);
    expect(view.preview()?.nextLine).toContain(newest.metadata.next_step);
    view.unmount();
  });

  it("filters modally: `/` opens filter and narrows, Enter keeps the query, Esc clears it", async () => {
    const { candidates, needle, matchingIds } = sample(arbitraryFilterScenario("goal"));
    const matches = (id: string): number => (matchingIds.includes(id) ? 1 : 0);
    const view = renderPickerView({ sessions: candidates, columns: sampleWidth() });

    // `/` switches to filter mode (footer hint changes), and typing narrows the rows.
    await view.type("/");
    expect(view.footerLine()).toBe(SESSION_PICKER_FILTER_HINT);
    await view.type(needle);
    for (const candidate of candidates) {
      expect(view.rowLinesFor(candidate.id)).toHaveLength(matches(candidate.id));
    }

    // Enter returns to browse mode keeping the query, so the rows stay narrowed.
    await view.enter();
    expect(view.footerLine()).toBe(SESSION_PICKER_BROWSE_HINT);
    expect(view.filterLine()).toContain(needle);
    for (const candidate of candidates) {
      expect(view.rowLinesFor(candidate.id)).toHaveLength(matches(candidate.id));
    }

    // Re-opening filter then Esc returns to browse mode with the query cleared — every row visible.
    await view.type("/");
    await view.esc();
    expect(view.footerLine()).toBe(SESSION_PICKER_BROWSE_HINT);
    expect(view.filterLine()).not.toContain(needle);
    for (const candidate of candidates) {
      expect(view.rowLinesFor(candidate.id)).toHaveLength(1);
    }
    view.unmount();
  });

  it.each(LAUNCH_CASES)(
    "launches the selected session with $key as the chosen runtime and auto-continue",
    async ({ key, runtime, autoContinue }) => {
      const session = sample(arbitraryClaimableSession());
      let launched: LaunchRecord | null = null;
      const view = renderPickerView({
        sessions: [session],
        columns: sampleWidth(),
        onLaunch: (launchedSession, launchedRuntime, launchedAuto) => {
          launched = { session: launchedSession, runtime: launchedRuntime, autoContinue: launchedAuto };
        },
      });

      await view.type(key);
      view.unmount();

      expect(launched).toEqual({ session, runtime, autoContinue });
    },
  );

  it("quits on q and on Esc without launching", async () => {
    for (const quitKey of ["q", "escape"] as const) {
      const session = sample(arbitraryClaimableSession());
      let launched = false;
      let quit = false;
      const view = renderPickerView({
        sessions: [session],
        columns: sampleWidth(),
        onLaunch: () => {
          launched = true;
        },
        onQuit: () => {
          quit = true;
        },
      });

      if (quitKey === "escape") await view.esc();
      else await view.type(quitKey);
      view.unmount();

      expect(quit).toBe(true);
      expect(launched).toBe(false);
    }
  });

  it("shows the empty state and launches nothing when no session is claimable", async () => {
    let launched = false;
    const view = renderPickerView({
      sessions: [],
      columns: sampleWidth(),
      onLaunch: () => {
        launched = true;
      },
    });

    expect(view.frame()).toContain(SESSION_PICKER_EMPTY_TEXT);
    await view.type("c");
    view.unmount();

    expect(launched).toBe(false);
  });

  it("renders the title, footer browse hint, and padded preview labels in their own places", () => {
    const session = sample(arbitraryClaimableSession());
    const view = renderPickerView({ sessions: [session], columns: sampleWidth() });

    expect(view.titleLine()).not.toContain(SESSION_PICKER_BROWSE_HINT);
    expect(view.footerLine()).toBe(SESSION_PICKER_BROWSE_HINT);
    expect(view.preview()?.goalLine.startsWith(`${PREVIEW_GOAL_LABEL} `)).toBe(true);
    expect(view.preview()?.nextLine.startsWith(`${PREVIEW_NEXT_LABEL} `)).toBe(true);
    view.unmount();
  });

  it("collapses a newline in a goal so the row stays a single line", () => {
    const { goal, tail } = sample(arbitraryGoalWithNewline());
    const id = sample(arbitrarySessionId());
    const view = renderPickerView({ sessions: [claimableSession({ id, goal })], columns: sampleWidth() });

    const rows = view.rowLinesFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(tail);
    view.unmount();
  });
});
