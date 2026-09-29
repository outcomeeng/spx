import fc from "fast-check";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import type { CheckName } from "@/domains/diagnose/manifest";
import type { CheckRecord, DiagnoseReport } from "@/domains/diagnose/types";
import { MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { arbitraryManifestFacts, arbitrarySpxFloor, type ManifestFacts } from "./manifest";
import { arbitraryCheckRecord } from "./report";

export interface OutputModeScenario {
  readonly report: DiagnoseReport;
  readonly facts: ManifestFacts;
  readonly version: string;
  readonly color: boolean;
}

export function arbitraryLongDiagnoseErrorToken(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((token) => token.repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1));
}

export function arbitraryOutputModeScenario(): fc.Arbitrary<OutputModeScenario> {
  return fc.tuple(
    fc.uniqueArray(arbitraryCheckRecord(), { minLength: 1, selector: (check) => check.name }),
    arbitraryManifestFacts(),
    arbitrarySpxFloor(),
    fc.boolean(),
  ).map(([checks, facts, version, color]) => ({
    report: { checks, overall: foldOverallVerdict(checks.map((check) => check.bucket)) },
    facts: { ...facts, checks: checks.map((check) => check.name as CheckName) },
    version,
    color,
  }));
}

/** The providers a registry offers and the check set a manifest selects from them, in selection order. */
export interface CheckSelectionScenario {
  readonly records: readonly CheckRecord[];
  readonly selected: readonly CheckName[];
}

/**
 * A registry of providers with distinct check names and a non-empty, reordered subset of those names
 * as the selected check set, so providers the manifest does not select are present to be skipped.
 */
export function arbitraryCheckSelectionScenario(): fc.Arbitrary<CheckSelectionScenario> {
  return fc
    .uniqueArray(arbitraryCheckRecord(), { minLength: 1, selector: (check) => check.name })
    .chain((records) =>
      fc
        .shuffledSubarray(records.map((check) => check.name as CheckName), { minLength: 1 })
        .map((selected) => ({ records, selected }))
    );
}
