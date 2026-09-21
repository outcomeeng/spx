import fc from "fast-check";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import type { CheckName } from "@/domains/diagnose/manifest";
import type { DiagnoseReport } from "@/domains/diagnose/types";
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
