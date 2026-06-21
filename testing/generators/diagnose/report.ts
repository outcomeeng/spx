/**
 * Generators for diagnose report inputs — per-check records and coherent folded
 * reports. Source-owned check names and buckets come from the production
 * modules; the verdict, readings, and remediation are drawn from whitespace-free
 * token domains so the rendered forms stay line-parseable in parity tests.
 *
 * @module testing/generators/diagnose/report
 */

import fc from "fast-check";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { type CheckRecord, type DiagnoseReport, VERDICT_BUCKET } from "@/domains/diagnose/types";

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

/** A coherent report whose overall verdict is the fold of its check buckets. */
export const arbitraryReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc.array(arbitraryCheckRecord(), { maxLength: 6 }).map((checks) => ({
    checks,
    overall: foldOverallVerdict(checks.map((check) => check.bucket)),
  }));
