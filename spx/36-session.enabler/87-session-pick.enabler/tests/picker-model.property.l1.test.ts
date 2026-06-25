/**
 * Picker-model invariants over generated inputs.
 *
 * Every input is generated and every expectation is derived from that input —
 * no hand-picked literal, no sentinel constant. Candidate text and filter
 * needles are drawn from disjoint alphabets (see the session generators) so a
 * filter match is deterministic rather than accidental.
 */

import { isAbsolute } from "node:path";

import * as fc from "fast-check";
import { describe, it } from "vitest";

import { visibleWidth } from "@/domains/session/display-width";
import {
  buildCandidates,
  buildPickupCommand,
  ELLIPSIS,
  filterCandidates,
  initialPickerState,
  keyToAction,
  PICKER_AUTO_CONTINUE_FLAG,
  PICKER_PICKUP_COMMAND_NAME,
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

function codePointFor(character: string): number {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) throw new Error("expected a character");
  return codePoint;
}

function arbitraryPathSafeCharacter(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.integer({ min: codePointFor("a"), max: codePointFor("z") }),
    fc.integer({ min: codePointFor("0"), max: codePointFor("9") }),
  ).map((codePoint) => String.fromCodePoint(codePoint));
}

/** A non-empty path segment built from path-safe characters. */
const pathSegment = fc.array(arbitraryPathSafeCharacter(), { minLength: 1, maxLength: 6 })
  .map(
    (chars) => chars.join(""),
  );

/** A POSIX-absolute directory: a leading slash and one or more segments. */
function arbitraryAbsoluteDir(): fc.Arbitrary<string> {
  return fc.array(pathSegment, { minLength: 1, maxLength: 3 }).map((segments) => `/${segments.join("/")}`);
}

/** A relative session-file path: segments joined without a leading slash, ending in `.md`. */
function arbitraryRelativePath(): fc.Arbitrary<string> {
  return fc.array(pathSegment, { minLength: 1, maxLength: 3 }).map((segments) => `${segments.join("/")}.md`);
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
          const expectedPrompt = `${prefix}${PICKER_PICKUP_COMMAND_NAME} ${reference}${
            autoContinue ? ` ${PICKER_AUTO_CONTINUE_FLAG}` : ""
          }`;
          return command === runtime && args.length === 1 && args[0] === expectedPrompt;
        },
      ),
    );
  });

  it("references the picked session by id for the default store and by its path for a custom store", () => {
    fc.assert(
      fc.property(
        arbitraryClaimableSession(),
        fc.string({ minLength: 1 }),
        arbitraryAbsoluteDir(),
        (session, customDir, cwd) => {
          const byDefault = pickupReference(session, undefined, cwd);
          const byCustom = pickupReference(session, customDir, cwd);
          // The generated session path is already absolute, so resolving against cwd is identity.
          return byDefault === session.id
            && byDefault !== session.path
            && byCustom === session.path
            && byCustom !== session.id;
        },
      ),
    );
  });

  it("makes a relative session path absolute against the working directory for a custom store", () => {
    fc.assert(
      fc.property(
        arbitraryClaimableSession(),
        fc.string({ minLength: 1 }),
        arbitraryAbsoluteDir(),
        arbitraryRelativePath(),
        (session, customDir, cwd, relativePath) => {
          const reference = pickupReference({ ...session, path: relativePath }, customDir, cwd);
          return isAbsolute(reference);
        },
      ),
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
        if (visibleWidth(result) > max) return false;
        if (visibleWidth(text) <= max) return result === text;
        return visibleWidth(result) <= max && result.endsWith(ELLIPSIS);
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
