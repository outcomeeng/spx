/** Assertion harness for diagnose manifest conformance evidence. */

import { expect } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { CHECK_NAME, type CheckName, parseManifest } from "@/domains/diagnose/manifest";
import {
  arbitraryManifestFacts,
  arbitraryManifestWithUnknownCheck,
  arbitraryManifestWithUnknownField,
  arbitraryManifestWithUnselectedInvalidMethodology,
  arbitraryUnavailableManifestCheck,
  invalidManifestRootClasses,
  invalidRequiredManifestClasses,
  manifestJson,
  retiredMarketplaceManifestFields,
} from "@testing/generators/diagnose/manifest";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

const allChecks = (): readonly CheckName[] => Object.values(CHECK_NAME);
const parseAgainstAllChecks = (rawJson: string) => parseManifest(rawJson, allChecks());
const manifestClassification = { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL } as const;

export function assertCompleteManifestRoundTrips(): void {
  assertProperty(
    arbitraryManifestFacts(),
    (facts) => {
      const result = parseAgainstAllChecks(manifestJson(facts));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.checks).toEqual(facts.checks);
      expect(result.value.spxFloor).toBe(
        facts.checks.includes(CHECK_NAME.SPX_REACHABILITY) ? facts.spxFloor : undefined,
      );
      expect(result.value.methodology).toEqual(
        facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)
          ? {
            [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
            [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
          }
          : undefined,
      );
    },
    manifestClassification,
  );
}

export function assertRequiredManifestFactsRejected(): void {
  for (const invalidClass of invalidRequiredManifestClasses()) {
    assertProperty(
      invalidClass,
      (rawJson) => {
        expect(parseAgainstAllChecks(rawJson).ok).toBe(false);
      },
      manifestClassification,
    );
  }
}

export function assertUnselectedMethodologyFactsIgnored(): void {
  assertProperty(
    arbitraryManifestWithUnselectedInvalidMethodology(),
    (rawJson) => {
      expect(parseAgainstAllChecks(rawJson).ok).toBe(true);
    },
    manifestClassification,
  );
}

export function assertUnknownManifestCheckRejected(): void {
  assertProperty(
    arbitraryManifestWithUnknownCheck(),
    (rawJson) => {
      expect(parseAgainstAllChecks(rawJson).ok).toBe(false);
    },
    manifestClassification,
  );
}

export function assertUnknownManifestFieldsRejected(): void {
  assertProperty(
    arbitraryManifestWithUnknownField(),
    (rawJson) => {
      expect(parseAgainstAllChecks(rawJson).ok).toBe(false);
    },
    manifestClassification,
  );
  for (const rawJson of retiredMarketplaceManifestFields()) {
    expect(parseAgainstAllChecks(rawJson).ok).toBe(false);
  }
}

export function assertUnavailableManifestCheckRejected(): void {
  assertProperty(
    arbitraryUnavailableManifestCheck(),
    ({ available, rawJson }) => {
      expect(parseManifest(rawJson, [available]).ok).toBe(false);
    },
    manifestClassification,
  );
}

export function assertInvalidManifestRootsRejected(): void {
  for (const invalidClass of invalidManifestRootClasses()) {
    assertProperty(
      invalidClass,
      (rawJson) => {
        expect(parseAgainstAllChecks(rawJson).ok).toBe(false);
      },
      manifestClassification,
    );
  }
}
