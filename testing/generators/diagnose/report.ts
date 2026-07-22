/**
 * Generators for diagnose report inputs — per-check records and coherent folded
 * reports. Source-owned check names and buckets come from the production
 * modules; the verdict, readings, and remediation are drawn from whitespace-free
 * token domains so the rendered forms stay line-parseable in parity tests.
 *
 * @module testing/generators/diagnose/report
 */

import fc from "fast-check";

import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, type DiagnoseReport, VERDICT_BUCKET } from "@/domains/diagnose/types";

import { arbitraryTerminalUnsafeCodePoint } from "@testing/generators/terminal-text/terminal-text";

import { arbitraryCheckName, arbitraryNameToken } from "./manifest";

/** A per-check record with a source-owned name and bucket and token-shaped renderable fields. */
export const arbitraryCheckRecord = (): fc.Arbitrary<CheckRecord> =>
  fc.record({
    name: arbitraryCheckName(),
    verdict: arbitraryNameToken(),
    bucket: fc.constantFrom(...Object.values(VERDICT_BUCKET)),
    readings: fc.dictionary(arbitraryNameToken(), arbitraryNameToken(), { maxKeys: 4 }),
    remediation: arbitraryNameToken(),
  });

/**
 * A reading value carrying one terminal-control byte between two tokens — the
 * shape a resolved path, a subprocess version reading, or a configured source
 * takes when the environment that produced it embedded a control sequence.
 */
export const arbitraryUnsafeReadingValue = (): fc.Arbitrary<string> =>
  fc
    .tuple(arbitraryNameToken(), arbitraryTerminalUnsafeCodePoint(), arbitraryNameToken())
    .map(([head, unsafeCode, tail]) => `${head}${String.fromCodePoint(unsafeCode)}${tail}`);

/**
 * A reachable-spx report whose version and path readings each carry a
 * terminal-control byte, so both the text and JSON renderings of the same
 * record can be compared.
 */
export const arbitraryUnsafeReadingReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc
    .tuple(arbitraryUnsafeReadingValue(), arbitraryUnsafeReadingValue(), arbitraryNameToken())
    .map(([version, path, remediation]) => ({
      checks: [{
        name: CHECK_NAME.SPX_REACHABILITY,
        verdict: SPX_REACHABILITY_VERDICT.REACHABLE,
        bucket: VERDICT_BUCKET.HEALTHY,
        readings: { version, path },
        remediation,
      }],
      overall: foldOverallVerdict([VERDICT_BUCKET.HEALTHY]),
    }));

/**
 * A methodology-context report whose `configuredSource` reading is absent
 * rather than empty — the case the partial readings record admits and the text
 * renderer resolves to the source-owned undefined sentinel.
 */
export const arbitraryAbsentReadingReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc
    .tuple(arbitraryNameToken(), arbitraryNameToken())
    .map(([observedVersion, remediation]) => ({
      checks: [{
        name: CHECK_NAME.METHODOLOGY_CONTEXT,
        verdict: METHODOLOGY_CONTEXT_VERDICT.RESOLVED,
        bucket: VERDICT_BUCKET.HEALTHY,
        readings: { observedVersion },
        remediation,
      }],
      overall: foldOverallVerdict([VERDICT_BUCKET.HEALTHY]),
    }));

/** A coherent report whose overall verdict is the fold of its check buckets. */
export const arbitraryReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc.array(arbitraryCheckRecord(), { maxLength: 6 }).map((checks) => ({
    checks,
    overall: foldOverallVerdict(checks.map((check) => check.bucket)),
  }));
