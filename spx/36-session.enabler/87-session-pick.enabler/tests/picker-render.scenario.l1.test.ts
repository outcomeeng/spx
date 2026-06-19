/**
 * Picker rendering scenarios.
 *
 * Sessions, widths, goals, and filter needles are all generated; every
 * expectation is derived from the generated input (the newest id, the matching
 * subset, the generated goal text), never a hand-picked literal or sentinel.
 * Each scenario mounts the picker through the render harness and queries the
 * frame by intent. The claim scenario wires the claim callback to the real
 * `pickupCommand` against a real session store.
 */

import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickupCommand } from "@/commands/session/pickup";
import { ELLIPSIS } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";
import {
  PREVIEW_GOAL_LABEL,
  PREVIEW_NEXT_LABEL,
  SESSION_PICKER_EMPTY_TEXT,
  SESSION_PICKER_HINT,
} from "@/interfaces/cli/session/pick/SessionPicker";
import {
  arbitraryClaimableSession,
  arbitraryClaimableSessionsSamePriority,
  arbitraryFilterScenario,
  arbitraryGoalWiderThan,
  arbitraryGoalWithNewline,
  arbitrarySessionId,
  arbitrarySessionPriority,
  claimableSession,
} from "@testing/generators/session/session";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";
import { renderPickerView } from "@testing/harnesses/session/picker";

/** Draw a single value from an arbitrary for an example-based scenario. */
function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

/** A generated terminal width wide enough that short generated goals are not truncated. */
function sampleWidth(): number {
  return sample(fc.integer({ min: 80, max: 120 }));
}

/** Lexical string comparator (timestamp ids sort chronologically by lexical order). */
function byLexicalOrder(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

describe("SessionPicker rendering", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

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

  it("narrows the visible rows to exactly the candidates matching the typed query", async () => {
    const { candidates, needle, matchingIds } = sample(arbitraryFilterScenario("goal"));
    const view = renderPickerView({ sessions: candidates, columns: sampleWidth() });

    await view.type(needle);

    for (const candidate of candidates) {
      expect(view.rowLinesFor(candidate.id)).toHaveLength(matchingIds.includes(candidate.id) ? 1 : 0);
    }
    view.unmount();
  });

  it("claims the down-selected session through pickupCommand and emits its PICKUP_ID", async () => {
    // Older id first (timestamp ids sort chronologically by lexical order).
    const [olderId, newerId] = [...sample(fc.uniqueArray(arbitrarySessionId(), { minLength: 2, maxLength: 2 }))]
      .sort(byLexicalOrder);
    const priority = sample(arbitrarySessionPriority());
    await harness.writeSession("todo", olderId, { priority });
    await harness.writeSession("todo", newerId, { priority });
    const sessions = [claimableSession({ id: olderId, priority }), claimableSession({ id: newerId, priority })];

    let claimOutput = "";
    let claimPromise: Promise<void> = Promise.resolve();
    const onClaim = (session: Session): void => {
      claimPromise = pickupCommand({ sessionIds: [session.id], sessionsDir: harness.sessionsDir }).then((output) => {
        claimOutput = output;
      });
    };

    const view = renderPickerView({ sessions, columns: sampleWidth(), onClaim });

    // Visible order is newest-first; one row down selects the older session.
    await view.arrowDown();
    await view.enter();
    await claimPromise;
    view.unmount();

    expect(claimOutput).toContain(`<PICKUP_ID>${olderId}</PICKUP_ID>`);
    expect(await harness.isInStatus("doing", olderId)).toBe(true);
    expect(await harness.isInStatus("todo", olderId)).toBe(false);
  });

  it("cancels on Esc without claiming", async () => {
    const session = sample(arbitraryClaimableSession());
    let claimed = false;
    let cancelled = false;
    const view = renderPickerView({
      sessions: [session],
      columns: sampleWidth(),
      onClaim: () => {
        claimed = true;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    await view.esc();
    view.unmount();

    expect(cancelled).toBe(true);
    expect(claimed).toBe(false);
  });

  it("shows the empty state and claims nothing when no session is claimable", async () => {
    let claimed = false;
    const view = renderPickerView({
      sessions: [],
      columns: sampleWidth(),
      onClaim: () => {
        claimed = true;
      },
    });

    expect(view.frame()).toContain(SESSION_PICKER_EMPTY_TEXT);
    await view.enter();
    view.unmount();

    expect(claimed).toBe(false);
  });

  it("renders the title, footer hint, and padded preview labels in their own places", () => {
    const session = sample(arbitraryClaimableSession());
    const view = renderPickerView({ sessions: [session], columns: sampleWidth() });

    // The keybinding hint is on its own footer line, never crammed into the title.
    expect(view.titleLine()).not.toContain(SESSION_PICKER_HINT);
    expect(view.footerLine()).toBe(SESSION_PICKER_HINT);
    // Each preview label is followed by exactly one padding space before its value.
    expect(view.preview()?.goalLine.startsWith(`${PREVIEW_GOAL_LABEL} `)).toBe(true);
    expect(view.preview()?.nextLine.startsWith(`${PREVIEW_NEXT_LABEL} `)).toBe(true);
    view.unmount();
  });

  it("renders any row on a single line truncated to the row width", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 160 }).chain((columns) =>
          fc.tuple(arbitraryGoalWiderThan(columns), arbitrarySessionId()).map(([goal, id]) => ({ columns, goal, id }))
        ),
        ({ columns, goal, id }) => {
          const view = renderPickerView({ sessions: [claimableSession({ id, goal })], columns });
          const rows = view.rowLinesFor(id);
          const ok = rows.length === 1 && rows[0].trimEnd().length <= columns && rows[0].endsWith(ELLIPSIS);
          view.unmount();
          return ok;
        },
      ),
      { numRuns: 25 },
    );
  });

  it("collapses a newline in a goal so the row stays a single line", () => {
    const { goal, tail } = sample(arbitraryGoalWithNewline());
    const id = sample(arbitrarySessionId());
    const view = renderPickerView({ sessions: [claimableSession({ id, goal })], columns: sampleWidth() });

    const rows = view.rowLinesFor(id);
    // One physical line, and the text after the break folded onto it.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(tail);
    view.unmount();
  });
});
