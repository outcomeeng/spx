/**
 * Mapping evidence for the non-interactive list color decision.
 *
 * `resolveListColor` is the pure resolver the `list`/`todo` descriptor calls
 * with the raw process facts it reads (`process.stdout.isTTY`, `NO_COLOR`, and
 * the `--color`/`--no-color` flag). This table enumerates the full
 * `(isTty, noColor, colorFlag)` domain — `colorFlag` drawn from the source-owned
 * `COLOR_FLAG` registry — and asserts the enabled/disabled outcome the spec
 * declares, including the TTY-true case the built-executable l2 evidence cannot
 * reach without a pseudo-terminal.
 */

import { describe, expect, it } from "vitest";

import { COLOR_FLAG, type ColorFlag, resolveListColor } from "@/domains/session/list";

interface ColorDecisionCase {
  readonly isTty: boolean;
  readonly noColor: boolean;
  readonly colorFlag: ColorFlag;
  readonly expected: boolean;
}

// The spec's decision table. `--color` (ON) forces enabled and `--no-color`
// (OFF) forces disabled over both inputs; with no flag (AUTO) color is enabled
// only on a TTY with no NO_COLOR. Expected booleans are the oracle, written
// from the spec rather than recomputed from the resolver under test.
const colorDecisionCases: readonly ColorDecisionCase[] = [
  { isTty: true, noColor: false, colorFlag: COLOR_FLAG.AUTO, expected: true },
  { isTty: true, noColor: true, colorFlag: COLOR_FLAG.AUTO, expected: false },
  { isTty: false, noColor: false, colorFlag: COLOR_FLAG.AUTO, expected: false },
  { isTty: false, noColor: true, colorFlag: COLOR_FLAG.AUTO, expected: false },

  { isTty: true, noColor: false, colorFlag: COLOR_FLAG.ON, expected: true },
  { isTty: true, noColor: true, colorFlag: COLOR_FLAG.ON, expected: true },
  { isTty: false, noColor: false, colorFlag: COLOR_FLAG.ON, expected: true },
  { isTty: false, noColor: true, colorFlag: COLOR_FLAG.ON, expected: true },

  { isTty: true, noColor: false, colorFlag: COLOR_FLAG.OFF, expected: false },
  { isTty: true, noColor: true, colorFlag: COLOR_FLAG.OFF, expected: false },
  { isTty: false, noColor: false, colorFlag: COLOR_FLAG.OFF, expected: false },
  { isTty: false, noColor: true, colorFlag: COLOR_FLAG.OFF, expected: false },
];

describe("resolveListColor decision table", () => {
  it.each(colorDecisionCases)(
    "isTty=$isTty noColor=$noColor colorFlag=$colorFlag -> $expected",
    ({ isTty, noColor, colorFlag, expected }) => {
      expect(resolveListColor({ isTty, noColor, colorFlag })).toBe(expected);
    },
  );

  it("covers every COLOR_FLAG member, so a new flag value cannot silently skip the table", () => {
    const flagsInTable = new Set(colorDecisionCases.map((testCase) => testCase.colorFlag));
    expect(flagsInTable).toEqual(new Set(Object.values(COLOR_FLAG)));
  });
});
