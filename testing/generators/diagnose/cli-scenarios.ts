import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { METHODOLOGY_FIXTURE_VERSION } from "@testing/harnesses/spec/context";
import { arbitrarySpxFloor } from "./manifest";

export interface DiagnoseCliScenario {
  readonly config: unknown;
  readonly floor?: string;
}

export function configuredDiagnoseScenario(): DiagnoseCliScenario {
  const floor = sampleGeneratedValue(arbitrarySpxFloor());
  return {
    config: {
      [DIAGNOSE_SECTION]: {
        [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY],
        [DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR]: floor,
      },
    },
    floor,
  };
}

export function unusedMethodologyScenario(): DiagnoseCliScenario {
  const floor = sampleGeneratedValue(arbitrarySpxFloor());
  return {
    config: {
      [DIAGNOSE_SECTION]: {
        [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY],
        [DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR]: floor,
      },
      methodology: {
        source: `../${sampleGeneratedValue(arbitraryDomainLiteral())}`,
        version: METHODOLOGY_FIXTURE_VERSION,
      },
    },
    floor,
  };
}

export function invalidMethodologyScenario(): DiagnoseCliScenario {
  return {
    config: {
      methodology: {
        source: `../${sampleGeneratedValue(arbitraryDomainLiteral())}`,
        version: METHODOLOGY_FIXTURE_VERSION,
      },
    },
    floor: sampleGeneratedValue(arbitrarySpxFloor()),
  };
}

export function malformedDiagnoseScenario(): DiagnoseCliScenario {
  return {
    config: {
      [DIAGNOSE_SECTION]: { [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [sampleGeneratedValue(arbitrarySpxFloor()).length] },
    },
    floor: sampleGeneratedValue(arbitrarySpxFloor()),
  };
}

export function bareDiagnoseScenario(): DiagnoseCliScenario {
  return { config: {} };
}
