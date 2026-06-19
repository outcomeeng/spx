/**
 * Picker-model invariants over generated inputs.
 *
 * Property 1 — the selection never leaves the visible range under any key
 * sequence. Property 2 — filtering yields a subsequence of the candidates.
 */

import * as fc from "fast-check";
import { describe, it } from "vitest";

import {
  ELLIPSIS,
  filterCandidates,
  initialPickerState,
  keyToAction,
  type PickerKey,
  type PickerState,
  reducePicker,
  toSingleLine,
  truncateToWidth,
  visibleCandidates,
} from "@/domains/session/pick-model";
import { arbitrarySession } from "@testing/generators/session/session";

/** Arbitrary key event spanning the control keys and printable input. */
function arbitraryPickerKey(): fc.Arbitrary<PickerKey> {
  return fc.oneof(
    fc.constant<PickerKey>({ input: "", downArrow: true }),
    fc.constant<PickerKey>({ input: "", upArrow: true }),
    fc.constant<PickerKey>({ input: "", backspace: true }),
    fc.constant<PickerKey>({ input: "", return: true }),
    fc.constant<PickerKey>({ input: "", escape: true }),
    fc.string({ minLength: 1, maxLength: 1 }).map((input) => ({ input })),
  );
}

function indexInRange(state: PickerState): boolean {
  const upper = Math.max(0, visibleCandidates(state).length - 1);
  return state.selectedIndex >= 0 && state.selectedIndex <= upper;
}

describe("picker model invariants", () => {
  it("keeps the selected index within the visible range under any key sequence", () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySession(), { maxLength: 12 }),
        fc.array(arbitraryPickerKey(), { maxLength: 30 }),
        (sessions, keys) => {
          let state = initialPickerState(sessions);
          if (!indexInRange(state)) return false;
          for (const key of keys) {
            const action = keyToAction(key);
            if (action === null) continue;
            state = reducePicker(state, action);
            if (!indexInRange(state)) return false;
          }
          return true;
        },
      ),
    );
  });

  it("filters to a subsequence of the candidate set", () => {
    fc.assert(
      fc.property(
        fc.array(arbitrarySession(), { maxLength: 12 }),
        fc.string(),
        (candidates, query) => {
          const filtered = filterCandidates(candidates, query);
          // Every filtered element appears in candidates, in candidate order,
          // with no reordering or invention.
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

  it("reduces any string to a single line with no line breaks and no collapsed whitespace runs", () => {
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
