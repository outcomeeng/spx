/**
 * Picker-model scenarios: candidate-set construction and filtering.
 *
 * Verifies the pure model of `spx/36-session.enabler/87-session-pick.enabler`
 * over in-memory sessions — no terminal, no Ink.
 */

import { describe, expect, it } from "vitest";

import { buildCandidates, filterCandidates } from "@/domains/session/pick-model";
import { SESSION_PRIORITY } from "@/domains/session/types";
import { makeSession } from "@testing/generators/session/session";

describe("buildCandidates", () => {
  it("keeps only todo sessions, ordered by priority then recency", () => {
    const sessions = [
      makeSession({ id: "2026-01-01_00-00-00", status: "todo", priority: SESSION_PRIORITY.LOW }),
      makeSession({ id: "2026-06-01_00-00-00", status: "todo", priority: SESSION_PRIORITY.HIGH }),
      makeSession({ id: "2026-01-01_00-00-01", status: "todo", priority: SESSION_PRIORITY.HIGH }),
      makeSession({ id: "2026-06-02_00-00-00", status: "doing", priority: SESSION_PRIORITY.HIGH }),
      makeSession({ id: "2026-06-03_00-00-00", status: "archive", priority: SESSION_PRIORITY.HIGH }),
    ];

    const candidates = buildCandidates(sessions);

    // Only the three todo sessions, high-priority newest first, low last.
    expect(candidates.map((session) => session.id)).toEqual([
      "2026-06-01_00-00-00",
      "2026-01-01_00-00-01",
      "2026-01-01_00-00-00",
    ]);
  });

  it("returns an empty candidate set when no session is in todo", () => {
    const sessions = [
      makeSession({ id: "2026-06-02_00-00-00", status: "doing" }),
      makeSession({ id: "2026-06-03_00-00-00", status: "archive" }),
    ];

    expect(buildCandidates(sessions)).toEqual([]);
  });
});

describe("filterCandidates", () => {
  const candidates = [
    makeSession({ id: "2026-06-01_00-00-00", goal: "Wire the sync-base skill", next_step: "Invoke understanding" }),
    makeSession({ id: "2026-06-02_00-00-00", goal: "Split guide templates", next_step: "Update render model" }),
    makeSession({ id: "2026-06-03_00-00-00", goal: "Runtime token rollout", next_step: "Convert spec-tree" }),
  ];

  it("returns candidates whose id, goal, or next step contains the query, in order", () => {
    const matched = filterCandidates(candidates, "render");
    expect(matched.map((session) => session.id)).toEqual(["2026-06-02_00-00-00"]);
  });

  it("matches against the identifier", () => {
    const matched = filterCandidates(candidates, "06-03");
    expect(matched.map((session) => session.id)).toEqual(["2026-06-03_00-00-00"]);
  });

  it("matches case-insensitively and preserves candidate order", () => {
    const matched = filterCandidates(candidates, "THE");
    // "Wire the sync-base skill" and "spec-tree" both miss; only the first goal carries "the".
    expect(matched.map((session) => session.id)).toEqual(["2026-06-01_00-00-00"]);
  });

  it("returns every candidate for an empty query", () => {
    expect(filterCandidates(candidates, "")).toHaveLength(candidates.length);
  });
});
