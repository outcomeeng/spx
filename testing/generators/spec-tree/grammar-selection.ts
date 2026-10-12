/**
 * Generators for the methodology declarations a spec-tree read selects its grammar from.
 *
 * The lines are the ones the agent-capability-lifecycle decision declares SPX reads:
 * 3.0, 3.1, 3.2, and 4.0. A declared version is any exact form on a line — the line itself
 * or the line with a drawn patch component.
 *
 * @module generators/spec-tree/grammar-selection
 */

import * as fc from "fast-check";

import { METHODOLOGY_VERSION_FORM } from "@/config/methodology";

export const GRAMMAR_SELECTION_LINE = {
  THREE_ZERO: "3.0",
  THREE_ONE: "3.1",
  THREE_TWO: "3.2",
  FOUR_ZERO: "4.0",
} as const;

export type GrammarSelectionLine = (typeof GRAMMAR_SELECTION_LINE)[keyof typeof GRAMMAR_SELECTION_LINE];

const GRAMMAR_SELECTION_LINES: readonly string[] = Object.values(GRAMMAR_SELECTION_LINE);

const VERSION_COMPONENT_MAX = 99;
const VERSION_SEPARATOR = ".";

function versionComponent(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: VERSION_COMPONENT_MAX });
}

/** An exact methodology version on the given line, in either accepted form. */
export function arbitraryVersionOnLine(line: GrammarSelectionLine): fc.Arbitrary<string> {
  return fc.tuple(fc.constantFrom(...Object.values(METHODOLOGY_VERSION_FORM)), versionComponent()).map((
    [form, patch],
  ) => form === METHODOLOGY_VERSION_FORM.LINE ? line : [line, patch].join(VERSION_SEPARATOR));
}

/** An exact methodology version on a line outside the lines SPX reads, in either accepted form. */
export function arbitraryUnsupportedVersion(): fc.Arbitrary<string> {
  return fc.tuple(
    versionComponent(),
    versionComponent(),
    fc.constantFrom(...Object.values(METHODOLOGY_VERSION_FORM)),
    versionComponent(),
  )
    .map(([major, minor, form, patch]) => ({
      line: [major, minor].join(VERSION_SEPARATOR),
      form,
      patch,
    }))
    .filter(({ line }) => !GRAMMAR_SELECTION_LINES.includes(line))
    .map(({ line, form, patch }) =>
      form === METHODOLOGY_VERSION_FORM.LINE ? line : [line, patch].join(VERSION_SEPARATOR)
    );
}

/** The lines SPX reads, as the diagnostic of an unsupported declaration names them. */
export function grammarSelectionLines(): readonly string[] {
  return GRAMMAR_SELECTION_LINES;
}
