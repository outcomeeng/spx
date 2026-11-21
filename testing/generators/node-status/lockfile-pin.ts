/**
 * Generators and the construction law behind the lockfile-pin mapping: each result section beside the verdict
 * mode of the verification that produces it, and the lockfile contents a checkout holds before and after a
 * commit that changes only the lockfile.
 *
 * @module testing/generators/node-status/lockfile-pin
 */
import * as fc from "fast-check";

import { NODE_STATUS_CLAIM_SECTION, type NodeStatusClaimSection } from "@/lib/node-status";
import { lockfileNamesOf, testingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

/** How a verification type produces its verdict. */
export const RESULT_VERDICT_MODE = {
  DETERMINISTIC: "deterministic",
  ATTESTED: "attested",
  AGENTIC: "agentic",
} as const;

export type ResultVerdictMode = (typeof RESULT_VERDICT_MODE)[keyof typeof RESULT_VERDICT_MODE];

const VERDICT_MODE_OF_SECTION: Readonly<Record<NodeStatusClaimSection, ResultVerdictMode>> = {
  [NODE_STATUS_CLAIM_SECTION.TEST]: RESULT_VERDICT_MODE.DETERMINISTIC,
  [NODE_STATUS_CLAIM_SECTION.EVAL]: RESULT_VERDICT_MODE.DETERMINISTIC,
  [NODE_STATUS_CLAIM_SECTION.PROBE]: RESULT_VERDICT_MODE.ATTESTED,
  [NODE_STATUS_CLAIM_SECTION.AUDIT]: RESULT_VERDICT_MODE.AGENTIC,
  [NODE_STATUS_CLAIM_SECTION.EVIDENCE]: RESULT_VERDICT_MODE.AGENTIC,
};

/**
 * Every dependency lockfile name a pin can meet: the names the strip removes together with the names each
 * registered testing language declares, so a language that declares a name the strip omits is a case.
 */
export function lockfileNameDomain(): readonly string[] {
  return lockfileNamesOf(testingRegistry);
}

/** One lockfile name, one result section, and the verdict mode of the verification that produces its entries. */
export interface LockfilePinCase {
  readonly lockfileName: string;
  readonly section: NodeStatusClaimSection;
  readonly mode: ResultVerdictMode;
}

/** Every result section a claim records, each beside its verdict mode, for every lockfile name of the domain. */
export function lockfilePinCases(): readonly LockfilePinCase[] {
  return lockfileNameDomain().flatMap((lockfileName) =>
    Object.values(NODE_STATUS_CLAIM_SECTION).map((section) => ({
      lockfileName,
      section,
      mode: VERDICT_MODE_OF_SECTION[section],
    }))
  );
}

/** Whether the pin of a result of `mode` holds the lockfile: a Deterministic or Attested result, never an Agentic one. */
export function pinHoldsLockfile(mode: ResultVerdictMode): boolean {
  return mode !== RESULT_VERDICT_MODE.AGENTIC;
}

/** Two distinct lockfile contents: the checkout's, and the one a commit that changes only the lockfile writes. */
export function arbitraryLockfileContents(): fc.Arbitrary<{ readonly before: string; readonly after: string }> {
  return fc
    .tuple(arbitraryDomainLiteral(), arbitraryDomainLiteral())
    .filter(([before, after]) => before !== after)
    .map(([before, after]) => ({ before, after }));
}
