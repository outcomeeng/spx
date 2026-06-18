/**
 * Picker rendering scenarios via ink-testing-library.
 *
 * Renders the real Ink component tree in-process to a string buffer and drives
 * it through its real key input — no mocked terminal. The claim scenario wires
 * the picker's claim callback to the real `pickupCommand`, so it proves the
 * picker claims through that handler against a real session store.
 *
 * The component is constructed with `createElement` rather than JSX so the test
 * keeps the canonical `.test.ts` extension; the JSX itself lives in the
 * component's `.tsx` source.
 */

import { access } from "node:fs/promises";
import { createElement } from "react";

import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickupCommand } from "@/commands/session/pickup";
import { ELLIPSIS } from "@/domains/session/pick-model";
import { type Session, SESSION_PRIORITY } from "@/domains/session/types";
import {
  SESSION_PICKER_EMPTY_TEXT,
  SESSION_PICKER_HINT,
  SessionPicker,
  type SessionPickerProps,
} from "@/interfaces/cli/session/pick/SessionPicker";
import { makeSession } from "@testing/generators/session/session";
import { createSessionHarness, type SessionHarness } from "@testing/harnesses/session/harness";

const ARROW_DOWN = "[B";
const ENTER = "\r";
const ESCAPE = "";

/** Renders the picker from props, avoiding JSX in a `.test.ts` file. */
function renderPicker(props: SessionPickerProps): ReturnType<typeof render> {
  return render(createElement(SessionPicker, props));
}

/** Let Ink process the written input and React flush the resulting state. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/** Two high-priority todo sessions; sorted newest-first the visible order is [newer, older]. */
const OLDER_ID = "2026-06-01_00-00-00";
const NEWER_ID = "2026-06-02_00-00-00";

function highTodo(id: string, goal: string, nextStep: string): Session {
  return makeSession({ id, status: "todo", priority: SESSION_PRIORITY.HIGH, goal, next_step: nextStep });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("SessionPicker rendering", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("lists claimable sessions with the newest high-priority one selected and previewed", () => {
    const sessions = [
      highTodo(OLDER_ID, "Older goal", "Older next step"),
      highTodo(NEWER_ID, "Newer goal", "Newer next step"),
    ];
    const { lastFrame, unmount } = renderPicker({ sessions, onClaim: () => {}, onCancel: () => {} });

    const frame = lastFrame() ?? "";
    expect(frame).toContain(OLDER_ID);
    expect(frame).toContain(NEWER_ID);
    // Newest high-priority session is selected and shown in the preview.
    expect(frame).toContain(`❯ ${NEWER_ID}`);
    expect(frame).toContain("Newer goal");
    expect(frame).toContain("Newer next step");
    unmount();
  });

  it("narrows the visible list and preview as filter text is typed", async () => {
    const sessions = [
      highTodo(OLDER_ID, "Alpha objective", "step a"),
      highTodo(NEWER_ID, "Beta objective", "step b"),
    ];
    const { lastFrame, stdin, unmount } = renderPicker({ sessions, onClaim: () => {}, onCancel: () => {} });

    stdin.write("alpha");
    await tick();

    const frame = lastFrame() ?? "";
    expect(frame).toContain(OLDER_ID);
    expect(frame).not.toContain(NEWER_ID);
    expect(frame).toContain("Alpha objective");
    // next_step renders only in the preview pane (never in a list row), so
    // asserting it confirms the preview followed the selection — not merely
    // that the goal text appears somewhere in the frame.
    expect(frame).toContain("step a");
    expect(frame).not.toContain("step b");
    unmount();
  });

  it("claims the selected session through pickupCommand and emits its PICKUP_ID", async () => {
    await harness.writeSession("todo", OLDER_ID, { priority: SESSION_PRIORITY.HIGH, goal: "Older goal" });
    await harness.writeSession("todo", NEWER_ID, { priority: SESSION_PRIORITY.HIGH, goal: "Newer goal" });
    const sessions = [
      highTodo(OLDER_ID, "Older goal", "Older next step"),
      highTodo(NEWER_ID, "Newer goal", "Newer next step"),
    ];

    let claimOutput = "";
    let claimPromise: Promise<void> = Promise.resolve();
    const onClaim = (session: Session): void => {
      claimPromise = pickupCommand({ sessionIds: [session.id], sessionsDir: harness.sessionsDir }).then((output) => {
        claimOutput = output;
      });
    };

    const { stdin, unmount } = renderPicker({ sessions, onClaim, onCancel: () => {} });

    // Visible order is [NEWER, OLDER]; one down selects OLDER, Enter claims it.
    stdin.write(ARROW_DOWN);
    await tick();
    stdin.write(ENTER);
    await tick();
    await claimPromise;
    unmount();

    expect(claimOutput).toContain(`<PICKUP_ID>${OLDER_ID}</PICKUP_ID>`);
    expect(await fileExists(`${harness.statusDir("doing")}/${OLDER_ID}.md`)).toBe(true);
    expect(await fileExists(`${harness.statusDir("todo")}/${OLDER_ID}.md`)).toBe(false);
  });

  it("cancels on Esc without claiming", async () => {
    const sessions = [highTodo(NEWER_ID, "Newer goal", "Newer next step")];
    let claimed = false;
    let cancelled = false;
    const { stdin, unmount } = renderPicker({
      sessions,
      onClaim: () => {
        claimed = true;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    stdin.write(ESCAPE);
    await tick();
    unmount();

    expect(cancelled).toBe(true);
    expect(claimed).toBe(false);
  });

  it("shows the empty state and claims nothing when no session is claimable", async () => {
    let claimed = false;
    const { lastFrame, stdin, unmount } = renderPicker({
      sessions: [],
      onClaim: () => {
        claimed = true;
      },
      onCancel: () => {},
    });

    expect(lastFrame() ?? "").toContain(SESSION_PICKER_EMPTY_TEXT);
    stdin.write(ENTER);
    await tick();
    unmount();

    expect(claimed).toBe(false);
  });

  it("renders single-line truncated rows, padded preview labels, and the hint on its own footer line", () => {
    const longGoal =
      "Refactor the session retention sweep so archived entries older than the keep-window are pruned deterministically across every worktree without races";
    const sessions = [
      makeSession({
        id: OLDER_ID,
        status: "todo",
        priority: SESSION_PRIORITY.HIGH,
        goal: longGoal,
        next_step: "Run the focused retention tests",
      }),
    ];
    const { lastFrame, unmount } = renderPicker({ sessions, onClaim: () => {}, onCancel: () => {} });
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");

    // The row carrying the id is a single truncated line: it ends in the ellipsis
    // and drops the goal's tail, which the full-text preview still shows below.
    const idLines = lines.filter((line) => line.includes(OLDER_ID));
    expect(idLines).toHaveLength(1);
    expect(idLines[0]).toContain(ELLIPSIS);
    expect(idLines[0]).not.toContain("without races");

    // The keybinding hint renders on its own line, never crammed into the title.
    const titleLine = lines.find((line) => line.includes("Pick a session to claim")) ?? "";
    expect(titleLine).not.toContain("filter");
    expect(frame).toContain(SESSION_PICKER_HINT);

    // Preview labels are separated from their values by exactly one space.
    expect(frame).toMatch(/goal: \S/);
    expect(frame).toMatch(/next: \S/);
    unmount();
  });
});
