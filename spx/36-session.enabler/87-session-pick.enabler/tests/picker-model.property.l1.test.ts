/**
 * Picker-model invariants over generated inputs.
 *
 * Every input is generated and every expectation is derived from that input —
 * no hand-picked literal, no sentinel constant. Candidate text and filter
 * needles are drawn from disjoint alphabets (see the session generators) so a
 * filter match is deterministic rather than accidental.
 */

import * as fc from "fast-check";
import { describe, it } from "vitest";

import {
  buildCandidates,
  buildPickupCommand,
  ELLIPSIS,
  filterCandidates,
  initialPickerState,
  keyToAction,
  PICKER_RUNTIME,
  type PickerKey,
  type PickerState,
  pickupReference,
  reducePicker,
  toSingleLine,
  truncateToWidth,
  visibleCandidates,
} from "@/domains/session/pick-model";
import { CLAIMABLE_STATUS, PRIORITY_ORDER } from "@/domains/session/types";
import {
  arbitraryClaimableSession,
  arbitraryFilterScenario,
  arbitrarySession,
  arbitrarySessionId,
  claimableSession,
  FILTER_FIELD,
} from "@testing/generators/session/session";

/** Arbitrary key event spanning the control keys and the meaningful printable keys (both modes). */
function arbitraryPickerKey(): fc.Arbitrary<PickerKey> {
  return fc.oneof(
    fc.constant<PickerKey>({ input: "", downArrow: true }),
    fc.constant<PickerKey>({ input: "", upArrow: true }),
    fc.constant<PickerKey>({ input: "", return: true }),
    fc.constant<PickerKey>({ input: "", escape: true }),
    fc.constant<PickerKey>({ input: "", backspace: true }),
    fc.constantFrom("/", "c", "C", "x", "X", "q", "a", "1", " ").map((input) => ({ input })),
  );
}

function indexInRange(state: PickerState): boolean {
  const upper = Math.max(0, visibleCandidates(state).length - 1);
  return state.selectedIndex >= 0 && state.selectedIndex <= upper;
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

describe("picker model invariants", () => {
  it("builds candidates as exactly the todo sessions, ordered by priority then recency", () => {
    fc.assert(
      fc.property(fc.array(arbitrarySession(), { maxLength: 16 }), (sessions) => {
        const result = buildCandidates(sessions);
        const todo = sessions.filter((session) => session.status === CLAIMABLE_STATUS);

        if (result.length !== todo.length) return false;
        if (!result.every((session) => todo.includes(session))) return false;

        for (let index = 1; index < result.length; index++) {
          const previous = result[index - 1];
          const current = result[index];
          const previousRank = PRIORITY_ORDER[previous.metadata.priority];
          const currentRank = PRIORITY_ORDER[current.metadata.priority];
          if (previousRank > currentRank) return false;
          if (previousRank === currentRank && previous.id < current.id) return false;
        }
        return true;
      }),
    );
  });

  it("keeps the selected index within the visible range under any key sequence across modes", () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySession(), { maxLength: 12 }),
        fc.array(arbitraryPickerKey(), { maxLength: 40 }),
        (sessions, keys) => {
          let state = initialPickerState(sessions);
          if (!indexInRange(state)) return false;
          for (const key of keys) {
            const action = keyToAction(key, state.mode);
            if (action === null) continue;
            state = reducePicker(state, action);
            if (!indexInRange(state)) return false;
          }
          return true;
        },
      ),
    );
  });

  it.each(Object.values(FILTER_FIELD))(
    "filters to exactly the candidates whose %s contains the query, case-insensitively, in order",
    (field) => {
      fc.assert(
        fc.property(arbitraryFilterScenario(field), ({ candidates, needle, matchingIds }) => {
          const exact = filterCandidates(candidates, needle).map((session) => session.id);
          const lowered = filterCandidates(candidates, needle.toLowerCase()).map((session) => session.id);
          return sameIds(exact, matchingIds) && sameIds(lowered, matchingIds);
        }),
      );
    },
  );

  it("matches a candidate by its full identifier", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbitrarySessionId(), { minLength: 1, maxLength: 6 }),
        fc.nat(),
        (ids, pick) => {
          const candidates = ids.map((id) => claimableSession({ id, goal: "", next_step: "" }));
          const target = ids[pick % ids.length];
          const matched = filterCandidates(candidates, target).map((session) => session.id);
          return matched.length === 1 && matched[0] === target;
        },
      ),
    );
  });

  it("returns every candidate for a blank query", () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryClaimableSession(), { maxLength: 8 }),
        fc.string({ unit: fc.constantFrom(" ", "\t"), maxLength: 4 }),
        (candidates, blank) => filterCandidates(candidates, blank).length === candidates.length,
      ),
    );
  });

  it("builds the agent command from the runtime, auto-continue flag, and session reference", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(PICKER_RUNTIME)),
        fc.boolean(),
        arbitrarySessionId(),
        (runtime, autoContinue, reference) => {
          const { command, args } = buildPickupCommand(runtime, autoContinue, reference);
          const prefix = runtime === PICKER_RUNTIME.CLAUDE ? "/" : "$";
          const expectedPrompt = `${prefix}pickup ${reference}${autoContinue ? " --auto-continue" : ""}`;
          return command === runtime && args.length === 1 && args[0] === expectedPrompt;
        },
      ),
    );
  });

  it("references the picked session by id for the default store and by absolute path for a custom store", () => {
    fc.assert(
      fc.property(arbitraryClaimableSession(), fc.string({ minLength: 1 }), (session, customDir) => {
        const byDefault = pickupReference(session, undefined);
        const byCustom = pickupReference(session, customDir);
        return byDefault === session.id
          && byDefault !== session.path
          && byCustom === session.path
          && byCustom !== session.id;
      }),
    );
  });

  it("filters to a subsequence of the candidate set", () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryClaimableSession(), { maxLength: 12 }),
        fc.string(),
        (candidates, query) => {
          const filtered = filterCandidates(candidates, query);
          let cursor = 0;
          for (const session of filtered) {
            const found = candidates.indexOf(session, cursor);
            if (found === -1) return false;
            cursor = found + 1;
          }
          return true;
        },
      ),
    );
  });

  it("truncates to at most the given width, preserving a fitting string and ellipsizing an overflow", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 200 }), (text, max) => {
        const result = truncateToWidth(text, max);
        if (result.length > max) return false;
        if (text.length <= max) return result === text;
        return result.length === max && result.endsWith(ELLIPSIS);
      }),
    );
  });

  it("reduces any string to a single line, collapsing every whitespace run to one space and trimming the ends", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const line = toSingleLine(text);
        if (/[\n\r\t]/.test(line)) return false;
        if (/ {2,}/.test(line)) return false;
        return line === line.trim();
      }),
    );
  });
});
