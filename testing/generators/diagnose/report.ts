/**
 * Generators for diagnose report inputs — per-check records and coherent folded
 * reports. Source-owned check names and buckets come from the production
 * modules; the verdict, readings, and remediation are drawn from whitespace-free
 * token domains so the rendered forms stay line-parseable in parity tests.
 *
 * @module testing/generators/diagnose/report
 */

import fc from "fast-check";

import { MARKETPLACE_INSTALL_VERDICT } from "@/domains/diagnose/checks/marketplace-install";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, type DiagnoseReport, VERDICT_BUCKET } from "@/domains/diagnose/types";

import { arbitraryNameToken } from "./manifest";

interface CheckIdentity {
  readonly name: CheckRecord["name"];
  readonly verdict: CheckRecord["verdict"];
}

const arbitraryCheckIdentity = (): fc.Arbitrary<CheckIdentity> =>
  fc.oneof(
    fc.record({
      name: fc.constant(CHECK_NAME.SPX_REACHABILITY),
      verdict: fc.constantFrom(...Object.values(SPX_REACHABILITY_VERDICT)),
    }),
    fc.record({
      name: fc.constant(CHECK_NAME.SESSION_ENVIRONMENT),
      verdict: fc.constantFrom(...Object.values(SESSION_ENVIRONMENT_VERDICT)),
    }),
    fc.record({
      name: fc.constant(CHECK_NAME.WORKTREE_POOL),
      verdict: fc.constantFrom(...Object.values(WORKTREE_POOL_VERDICT)),
    }),
    fc.record({
      name: fc.constant(CHECK_NAME.SESSION_STORE),
      verdict: fc.constantFrom(...Object.values(SESSION_STORE_VERDICT)),
    }),
    fc.record({
      name: fc.constant(CHECK_NAME.MARKETPLACE_INSTALL),
      verdict: fc.constantFrom(...Object.values(MARKETPLACE_INSTALL_VERDICT)),
    }),
    fc.record({
      name: fc.constant(CHECK_NAME.METHODOLOGY_CONTEXT),
      verdict: fc.constantFrom(...Object.values(METHODOLOGY_CONTEXT_VERDICT)),
    }),
  );

/** A per-check record with a source-owned name and bucket and token-shaped renderable fields. */
export const arbitraryCheckRecord = (): fc.Arbitrary<CheckRecord> =>
  fc.tuple(
    arbitraryCheckIdentity(),
    fc.constantFrom(...Object.values(VERDICT_BUCKET)),
    fc.dictionary(arbitraryNameToken(), arbitraryNameToken(), { maxKeys: 4 }),
    arbitraryNameToken(),
  ).map(([identity, bucket, readings, remediation]) => ({ ...identity, bucket, readings, remediation }));

/** A coherent report whose overall verdict is the fold of its check buckets. */
export const arbitraryReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc.array(arbitraryCheckRecord(), { maxLength: 6 }).map((checks) => ({
    checks,
    overall: foldOverallVerdict(checks.map((check) => check.bucket)),
  }));
