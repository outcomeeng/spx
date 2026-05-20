import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION_METADATA } from "@/domains/session/list";
import { DEFAULT_KEEP_COUNT, selectSessionsToDelete } from "@/domains/session/prune";
import { type Session, SESSION_STATUSES } from "@/domains/session/types";

const [TODO, DOING, ARCHIVE] = SESSION_STATUSES;

function session(id: string, status: typeof SESSION_STATUSES[number] = ARCHIVE): Session {
  return {
    id,
    status,
    path: `/sessions/${status}/${id}.md`,
    metadata: DEFAULT_SESSION_METADATA,
  };
}

function sessionId(day: number): string {
  return `2026-01-${String(day).padStart(2, "0")}_10-00-00`;
}

describe("session retention properties", () => {
  it("GIVEN todo and doing sessions WHEN prune candidates are selected THEN active sessions are not selected by archive caller input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        (todoCount, doingCount, archiveCount, keep) => {
          const todo = Array.from({ length: todoCount }, (_, index) => session(sessionId(index + 1), TODO));
          const doing = Array.from({ length: doingCount }, (_, index) => session(sessionId(index + 20), DOING));
          const archive = Array.from({ length: archiveCount }, (_, index) => session(sessionId(index + 40), ARCHIVE));

          const selected = selectSessionsToDelete(archive, { keep });
          const selectedIds = new Set(selected.map((item) => item.id));

          for (const active of [...todo, ...doing]) {
            expect(selectedIds.has(active.id)).toBe(false);
          }
        },
      ),
    );
  });

  it("GIVEN keep is at least archive count WHEN selected THEN no archived session is selected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (archiveCount) => {
        const archive = Array.from({ length: archiveCount }, (_, index) => session(sessionId(index + 1)));

        expect(selectSessionsToDelete(archive, { keep: archiveCount })).toEqual([]);
      }),
    );
  });

  it("GIVEN unparsable archive IDs WHEN selected THEN ordering is deterministic", () => {
    const archive = [session("zzz"), session("aaa"), session(sessionId(1)), session(sessionId(2))];

    expect(selectSessionsToDelete(archive, { keep: DEFAULT_KEEP_COUNT - 3 }).map((item) => item.id))
      .toEqual(selectSessionsToDelete(archive, { keep: DEFAULT_KEEP_COUNT - 3 }).map((item) => item.id));
  });
});
