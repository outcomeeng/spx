/** Coherent CLI argument and manifest scenarios for diagnose command evidence. */

import { DEFAULT_METHODOLOGY_SOURCE, DEFAULT_METHODOLOGY_VERSION } from "@/config/methodology";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { CHECK_NAME, DIAGNOSE_MANIFEST_FIELDS } from "@/domains/diagnose/manifest";
import { DIAGNOSE_OUTPUT_MODE, type DiagnoseOutputMode } from "@/domains/diagnose/report";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";

import { arbitraryManifestFacts, arbitrarySpxFloor, manifestJson, sampleDiagnoseTestValue } from "./manifest";

export interface DiagnoseOutputSelectorCase {
  readonly name: DiagnoseOutputMode;
  readonly args: readonly string[];
  readonly outputMode: DiagnoseOutputMode;
}

export interface DiagnoseManifestScenario {
  readonly json: string;
  readonly spxFloor: string;
}

export interface InvalidOutputOptionCase {
  readonly name: string;
  readonly args: readonly string[];
  readonly expectedTokens: readonly string[];
}

export interface DiagnoseConfigScenario {
  readonly spxFloor: string;
  readonly yaml: string;
}

export function diagnoseOutputSelectorCases(): readonly DiagnoseOutputSelectorCase[] {
  const argsByMode = {
    [DIAGNOSE_OUTPUT_MODE.CONCISE]: [],
    [DIAGNOSE_OUTPUT_MODE.VERBOSE]: [DIAGNOSE_CLI.VERBOSE_FLAG],
    [DIAGNOSE_OUTPUT_MODE.JSON]: [DIAGNOSE_CLI.JSON_FLAG],
  } satisfies Record<DiagnoseOutputMode, readonly string[]>;
  return Object.values(DIAGNOSE_OUTPUT_MODE).map((outputMode) => ({
    name: outputMode,
    args: argsByMode[outputMode],
    outputMode,
  }));
}

export function spxReachabilityManifestScenario(): DiagnoseManifestScenario {
  const facts = sampleDiagnoseTestValue(arbitraryManifestFacts());
  const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
  return {
    spxFloor,
    json: manifestJson({ ...facts, checks: [CHECK_NAME.SPX_REACHABILITY], spxFloor }),
  };
}

export function allChecksManifestJson(): string {
  return manifestJson({
    ...sampleDiagnoseTestValue(arbitraryManifestFacts()),
    checks: Object.values(CHECK_NAME),
    methodologySource: DEFAULT_METHODOLOGY_SOURCE,
    methodologyVersion: DEFAULT_METHODOLOGY_VERSION,
  });
}

export function diagnoseConfigScenario(): DiagnoseConfigScenario {
  const spxFloor = sampleDiagnoseTestValue(arbitrarySpxFloor());
  return {
    spxFloor,
    yaml: [
      `${DIAGNOSE_SECTION}:`,
      `  ${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR}: "${spxFloor}"`,
      `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: ["${CHECK_NAME.SPX_REACHABILITY}"]`,
    ].join("\n"),
  };
}

export function malformedDiagnoseConfigYaml(): string {
  return [
    `${DIAGNOSE_SECTION}:`,
    `  ${DIAGNOSE_CONFIG_FIELDS.CHECKS}: [42]`,
  ].join("\n");
}

export function invalidManifestCheckJson(unsafeByte: string): string {
  return JSON.stringify({
    [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [`${CHECK_NAME.SPX_REACHABILITY}${unsafeByte}`],
  });
}

export function invalidOutputOptionCases(manifestPath: string, unsafeByte: string): readonly InvalidOutputOptionCase[] {
  return [
    {
      name: "removed format selector",
      args: [
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.REMOVED_FORMAT_FLAG,
        DIAGNOSE_OUTPUT_MODE.JSON,
      ],
      expectedTokens: [DIAGNOSE_CLI.REMOVED_FORMAT_FLAG],
    },
    {
      name: "conflicting selectors",
      args: [DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.VERBOSE_FLAG, DIAGNOSE_CLI.JSON_FLAG],
      expectedTokens: [DIAGNOSE_CLI.VERBOSE_FLAG, DIAGNOSE_CLI.JSON_FLAG],
    },
    {
      name: "unsafe unknown selector",
      args: [`${DIAGNOSE_CLI.REMOVED_FORMAT_FLAG}${unsafeByte}`],
      expectedTokens: [],
    },
  ];
}

export const DIAGNOSE_OUTPUT_SELECTOR_CASES = diagnoseOutputSelectorCases();
