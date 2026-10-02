/**
 * Generators for styled-output inputs. Severities come from the production
 * registry; header, detail, and summary text range over arbitrary Unicode text
 * — spaces and non-ASCII included — with only the C0 control bytes, newline and
 * ESC among them, and DEL replaced, so styled and plain renders differ only by
 * ANSI and stay line-parseable. Color-choice generators partition the
 * descriptor-boundary inputs by the precedence tier that decides them.
 *
 * @module testing/generators/styled-output/styled-output
 */

import fc from "fast-check";

import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import {
  type ColorChoice,
  SEVERITY,
  type Severity,
  type StyledReportModel,
  type StyledReportOptions,
  type StyledSection,
  type StyledSummary,
} from "@/lib/styled-output/styled-output";
import { authoredText, type TerminalText } from "@/lib/terminal-text/terminal-text";

const MAX_TEXT_LENGTH = 24;
const MAX_DETAILS = 5;
const MAX_SECTIONS = 6;
const CONTROL_REPLACEMENT = "x";

function isControlCodePoint(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? FIRST_PRINTABLE_CHAR_CODE;
  return codePoint < FIRST_PRINTABLE_CHAR_CODE || codePoint === DEL_CHAR_CODE;
}

function replaceControlCodePoints(value: string): string {
  return Array.from(value, (character) => (isControlCodePoint(character) ? CONTROL_REPLACEMENT : character)).join("");
}

/**
 * Unicode text with every control byte replaced, stated as the product's own so the formatter
 * receives content already decided. Removing ESC keeps ANSI stripping exact; removing newline keeps
 * one rendered line per element.
 */
const arbitraryStyledText = (): fc.Arbitrary<TerminalText> =>
  fc.string({ unit: "grapheme", minLength: 1, maxLength: MAX_TEXT_LENGTH }).map((value) =>
    authoredText(replaceControlCodePoints(value))
  );

/** A severity drawn from the production registry. */
const arbitrarySeverity = (): fc.Arbitrary<Severity> => fc.constantFrom(...Object.values(SEVERITY));

const arbitrarySectionOf = (severity: fc.Arbitrary<Severity>): fc.Arbitrary<StyledSection> =>
  fc.record({
    severity,
    header: arbitraryStyledText(),
    details: fc.array(arbitraryStyledText(), { maxLength: MAX_DETAILS }),
  });

const arbitrarySummaryOf = (severity: fc.Arbitrary<Severity>): fc.Arbitrary<StyledSummary> =>
  fc.record({ severity, text: arbitraryStyledText() });

/** A styled report model: a list of sections plus a closing summary. */
export const arbitraryStyledReportModel = (): fc.Arbitrary<StyledReportModel> =>
  fc.record({
    sections: fc.array(arbitrarySectionOf(arbitrarySeverity()), { maxLength: MAX_SECTIONS }),
    summary: arbitrarySummaryOf(arbitrarySeverity()),
  });

/** One render input: a report model with the color boolean it is rendered under. */
export interface StyledRenderCase {
  readonly model: StyledReportModel;
  readonly options: StyledReportOptions;
}

/** A report model paired with a generated color boolean. */
export const arbitraryStyledRenderCase = (): fc.Arbitrary<StyledRenderCase> =>
  fc.record({ model: arbitraryStyledReportModel(), options: fc.record({ color: fc.boolean() }) });

/** A report with exactly one section. */
export interface SingleSectionReport extends StyledReportModel {
  readonly sections: readonly [StyledSection];
}

/** A one-section report whose section and summary both carry the given severity. */
export const arbitrarySingleSeverityReport = (severity: Severity): fc.Arbitrary<SingleSectionReport> =>
  fc.record({
    sections: fc.tuple(arbitrarySectionOf(fc.constant(severity))),
    summary: arbitrarySummaryOf(fc.constant(severity)),
  });

/** A report with one section and two detail lines, so both tree branches render. */
export interface HeaderDetailsSummaryReport extends StyledReportModel {
  readonly sections: readonly [StyledSection & { readonly details: readonly [TerminalText, TerminalText] }];
}

/** A report with one section header, a non-final and a final detail line, and a summary. */
export const arbitraryHeaderDetailsSummaryReport = (): fc.Arbitrary<HeaderDetailsSummaryReport> =>
  fc.record({
    sections: fc.tuple(
      fc.record({
        severity: arbitrarySeverity(),
        header: arbitraryStyledText(),
        details: fc.tuple(arbitraryStyledText(), arbitraryStyledText()),
      }),
    ),
    summary: arbitrarySummaryOf(arbitrarySeverity()),
  });

/** A `NO_COLOR` value that leaves the decision to the next tier: unset or empty. */
const arbitraryInertNoColor = (): fc.Arbitrary<string | undefined> => fc.constantFrom(undefined, "");

/** Any `NO_COLOR` value: unset, empty, or a non-empty string. */
const arbitraryAnyNoColor = (): fc.Arbitrary<string | undefined> =>
  fc.oneof(arbitraryInertNoColor(), fc.string({ minLength: 1 }));

/** Color-choice inputs carrying an explicit `--color`/`--no-color` flag, with any NO_COLOR and TTY status. */
export const arbitraryFlaggedColorChoice = (): fc.Arbitrary<ColorChoice & { readonly flag: boolean }> =>
  fc.record({ flag: fc.boolean(), noColor: arbitraryAnyNoColor(), isTty: fc.boolean() });

/** Color-choice inputs with no flag and a non-empty NO_COLOR, with any TTY status. */
export const arbitraryNoColorDisabledChoice = (): fc.Arbitrary<ColorChoice> =>
  fc.record({ flag: fc.constant(undefined), noColor: fc.string({ minLength: 1 }), isTty: fc.boolean() });

/** Color-choice inputs with no flag and NO_COLOR unset or empty, so the TTY status decides. */
export const arbitraryTtyDecidedChoice = (): fc.Arbitrary<ColorChoice> =>
  fc.record({ flag: fc.constant(undefined), noColor: arbitraryInertNoColor(), isTty: fc.boolean() });
