/**
 * Property evidence for the pure non-interactive list text formatter.
 *
 * `formatSessionListText` renders one status group's sessions as plain text,
 * styled through a chalk instance whose level is fixed from the passed `color`
 * boolean and truncated to the passed `width`. Two invariants hold across
 * generated session lists:
 *
 *  - width-bound: every rendered line's escape-stripped display width stays
 *    within the supplied width, in both color modes;
 *  - color toggle: ANSI escapes appear only when color is enabled.
 *
 * Sessions are drawn from the source-owned `arbitraryClaimableSession`
 * generator; no session field is hand-authored here.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatSessionListText, LIST_TEXT_MIN_WIDTH } from "@/domains/session/list";
import { arbitraryClaimableSession } from "@testing/generators/session/session";
import { ANSI_ESCAPE, stripAnsi } from "@testing/harnesses/styled-output/ansi";

/** Display width of a rendered line: its length with ANSI styling removed. */
function displayWidth(line: string): number {
  return stripAnsi(line).length;
}

const arbitrarySessionList = fc.array(arbitraryClaimableSession(), { minLength: 1, maxLength: 8 });
const arbitraryWidth = fc.integer({ min: LIST_TEXT_MIN_WIDTH, max: 200 });

describe("formatSessionListText", () => {
  it("keeps every rendered line's display width within the supplied width in both color modes", () => {
    fc.assert(
      fc.property(arbitrarySessionList, arbitraryWidth, fc.boolean(), (sessions, width, color) => {
        const output = formatSessionListText(sessions, { color, width });
        for (const line of output.split("\n")) {
          expect(displayWidth(line)).toBeLessThanOrEqual(width);
        }
      }),
    );
  });

  it("emits ANSI escapes only when color is enabled", () => {
    fc.assert(
      fc.property(arbitrarySessionList, arbitraryWidth, (sessions, width) => {
        expect(formatSessionListText(sessions, { color: false, width })).not.toContain(ANSI_ESCAPE);
        expect(formatSessionListText(sessions, { color: true, width })).toContain(ANSI_ESCAPE);
      }),
    );
  });
});
