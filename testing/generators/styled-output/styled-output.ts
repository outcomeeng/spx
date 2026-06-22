/**
 * Generators for styled-output report models. Severities come from the
 * production registry; header, detail, and summary text are drawn from a
 * printable-ASCII domain with no ESC or newline bytes so styled and plain
 * renders differ only by ANSI and stay line-parseable in parity tests.
 *
 * @module testing/generators/styled-output/styled-output
 */

import fc from "fast-check";

import {
  SEVERITY,
  type Severity,
  type StyledReportModel,
  type StyledSection,
  type StyledSummary,
} from "@/lib/styled-output/styled-output";

/** Printable-ASCII text with no control, ESC, or whitespace bytes that would confuse ANSI stripping or line joins. */
const arbitrarySafeText = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 24 }).map((value) => value.replaceAll(/[^!-~]/g, "x"));

/** A severity drawn from the production registry. */
const arbitrarySeverity = (): fc.Arbitrary<Severity> => fc.constantFrom(...Object.values(SEVERITY));

/** A section with a source-owned severity and safe header and detail text. */
const arbitrarySection = (): fc.Arbitrary<StyledSection> =>
  fc.record({
    severity: arbitrarySeverity(),
    header: arbitrarySafeText(),
    details: fc.array(arbitrarySafeText(), { maxLength: 5 }),
  });

/** A summary line with a source-owned severity and safe text. */
const arbitrarySummary = (): fc.Arbitrary<StyledSummary> =>
  fc.record({ severity: arbitrarySeverity(), text: arbitrarySafeText() });

/** A styled report model: a list of sections plus a closing summary. */
export const arbitraryStyledReportModel = (): fc.Arbitrary<StyledReportModel> =>
  fc.record({
    sections: fc.array(arbitrarySection(), { maxLength: 6 }),
    summary: arbitrarySummary(),
  });
