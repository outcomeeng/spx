/**
 * Generators for diagnose manifest inputs — the consumer-varying facts a
 * manifest carries (the spx-version floor, methodology selection, and the
 * check set). Source-owned
 * field and check names come from production modules; variable facts and invalid
 * shapes are drawn from input domains so tests exercise the manifest contract
 * across the space rather than one hand-picked manifest.
 *
 * @module testing/generators/diagnose/manifest
 */

import fc from "fast-check";

import { isMethodologySource, METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import {
  CHECK_NAME,
  type CheckName,
  DIAGNOSE_MANIFEST_FIELDS,
  RETIRED_DIAGNOSE_MANIFEST_FIELDS,
} from "@/domains/diagnose/manifest";

const DIAGNOSE_SAMPLE_SEED = 7;

/** A semver-shaped spx-version floor. */
export const arbitrarySpxFloor = (): fc.Arbitrary<string> =>
  fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** A non-empty floor string that cannot be parsed as semver. */
export const arbitraryInvalidSpxFloor = (): fc.Arbitrary<string> =>
  arbitraryNameToken().filter((value) => !/^\s*\d{1,9}\.\d{1,9}\.\d{1,9}(-[0-9A-Za-z.-]{1,64})?/.test(value));

/** Samples a deterministic diagnose generator value for scenario/compliance tests. */
export function sampleDiagnoseTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed: DIAGNOSE_SAMPLE_SEED });
  return value;
}

/** A non-empty whitespace-free token used for generated diagnostic values. */
export const arbitraryNameToken = (): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength: 24 })
    .map((value) => value.replaceAll(/\s/g, ""))
    .filter((value) => value.length > 0);

/** An `owner/repo` source. */
export const arbitraryMarketplaceSource = (): fc.Arbitrary<string> =>
  fc.tuple(arbitraryNameToken(), arbitraryNameToken()).map(([owner, repo]) => `${owner}/${repo}`);

/** A methodology `owner/repository` source accepted by the methodology config validator. */
export const arbitraryMethodologySource = (): fc.Arbitrary<string> =>
  fc.tuple(arbitraryNameToken(), arbitraryNameToken())
    .map(([owner, repo]) => `${owner}/${repo}`)
    .filter(isMethodologySource);

/** A non-empty methodology source rejected by the production owner/repository predicate. */
export const arbitraryInvalidMethodologySource = (): fc.Arbitrary<string> =>
  arbitraryNameToken().filter((source) => !isMethodologySource(source));

/** A single source-owned check name. */
export const arbitraryCheckName = (): fc.Arbitrary<CheckName> => fc.constantFrom(...Object.values(CHECK_NAME));

/** The full set of facts a manifest may carry; the serializer emits only the facts the selected checks require. */
export interface ManifestFacts {
  readonly checks: readonly CheckName[];
  readonly spxFloor: string;
  readonly methodologySource: string;
  readonly methodologyVersion: string;
}

/** A coherent set of manifest facts with a non-empty, duplicate-free check set. */
export const arbitraryManifestFacts = (): fc.Arbitrary<ManifestFacts> =>
  fc.record({
    checks: fc.uniqueArray(arbitraryCheckName(), { minLength: 1 }),
    spxFloor: arbitrarySpxFloor(),
    methodologySource: arbitraryMethodologySource(),
    methodologyVersion: arbitraryNameToken(),
  });

const knownCheckNames = (): readonly string[] => Object.values(CHECK_NAME);

const invalidRequiredStringClasses = (): readonly fc.Arbitrary<unknown>[] => [
  fc.constant(""),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.array(arbitraryNameToken()),
  fc.dictionary(arbitraryNameToken(), arbitraryNameToken()),
];

const invalidRecordContainerClasses = (): readonly fc.Arbitrary<unknown>[] => [
  fc.constant(null),
  arbitraryNameToken(),
  fc.integer(),
  fc.boolean(),
  fc.array(arbitraryNameToken()),
  fc.constant({}),
];

const methodologyFieldNames = (): ReadonlySet<string> => new Set(Object.values(METHODOLOGY_CONFIG_FIELDS));

const arbitraryUnknownMethodologyField = (): fc.Arbitrary<string> =>
  arbitraryNameToken().filter((field) => !methodologyFieldNames().has(field));

/** One generated domain for every finite missing or malformed required-fact class. */
export const invalidRequiredManifestClasses = (): readonly fc.Arbitrary<string>[] => [
  fc.constant(JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY] })),
  ...invalidRequiredStringClasses().map((invalidClass) =>
    invalidClass.map((invalid) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY],
        [DIAGNOSE_MANIFEST_FIELDS.SPX_FLOOR]: invalid,
      })
    )
  ),
  fc.constant(JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT] })),
  ...invalidRecordContainerClasses().map((invalidClass) =>
    invalidClass.map((invalid) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
        [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: invalid,
      })
    )
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
      [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
      },
    })
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
      [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
      },
    })
  ),
  ...invalidRequiredStringClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
        [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: invalid,
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
        },
      })
    )
  ),
  ...invalidRequiredStringClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
        [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: invalid,
        },
      })
    )
  ),
  fc.tuple(arbitraryManifestFacts(), arbitraryInvalidMethodologySource()).map(([facts, invalidSource]) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
      [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: invalidSource,
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
      },
    })
  ),
  fc.tuple(arbitraryManifestFacts(), arbitraryUnknownMethodologyField(), arbitraryNameToken()).map(
    ([facts, unknownField, unknownValue]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT],
        [DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
          [unknownField]: unknownValue,
        },
      }),
  ),
];

/** A valid manifest carrying ignored malformed methodology facts while that check is unselected. */
export const arbitraryManifestWithUnselectedInvalidMethodology = (): fc.Arbitrary<string> =>
  arbitraryManifestFacts()
    .filter((facts) => !facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT))
    .map((facts) => {
      const body = JSON.parse(manifestJson(facts)) as Record<string, unknown>;
      body[DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY] = {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: "",
      };
      return JSON.stringify(body);
    });

/** A manifest containing one source-owned check and one generated unknown check name. */
export const arbitraryManifestWithUnknownCheck = (): fc.Arbitrary<string> =>
  fc.tuple(
    arbitraryCheckName(),
    fc.string({ minLength: 1 }).filter((name) => !knownCheckNames().includes(name)),
  ).map(([known, unknown]) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [known, unknown],
    })
  );

const manifestFieldNames = (): ReadonlySet<string> => new Set(Object.values(DIAGNOSE_MANIFEST_FIELDS));

/** A valid manifest extended with one generated field outside the caller-fact contract. */
export const arbitraryManifestWithUnknownField = (): fc.Arbitrary<string> =>
  fc.tuple(
    arbitraryManifestFacts(),
    arbitraryNameToken().filter((field) => !manifestFieldNames().has(field)),
    arbitraryNameToken(),
  ).map(([facts, field, value]) => {
    const body = JSON.parse(manifestJson(facts)) as Record<string, unknown>;
    body[field] = value;
    return JSON.stringify(body);
  });

/** A marketplace-install manifest carrying the retired plugin-intent fields. */
export const retiredMarketplaceManifestFields = (): readonly string[] => [
  JSON.stringify({
    [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
    [RETIRED_DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: sampleManifestRetiredFieldValue(),
  }),
  JSON.stringify({
    [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
    [RETIRED_DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: sampleManifestRetiredFieldValue(),
  }),
];

function sampleManifestRetiredFieldValue(): string {
  return sampleDiagnoseTestValue(arbitraryNameToken());
}

export interface UnavailableManifestCheckCase {
  readonly available: CheckName;
  readonly rawJson: string;
}

/** A manifest requesting a known check excluded from the supplied build registry. */
export const arbitraryUnavailableManifestCheck = (): fc.Arbitrary<UnavailableManifestCheckCase> =>
  fc.tuple(arbitraryCheckName(), arbitraryCheckName())
    .filter(([available, requested]) => available !== requested)
    .map(([available, requested]) => ({
      available,
      rawJson: JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [requested] }),
    }));

/** One generated domain for every finite invalid root and check-container category. */
export const invalidManifestRootClasses = (): readonly fc.Arbitrary<string>[] => [
  fc.constant(JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [] })),
  fc.constant(JSON.stringify({})),
  fc.array(arbitraryCheckName()).map((checks) => JSON.stringify(checks)),
  arbitraryNameToken().map((token) => `{ ${token}`),
  fc.constant(JSON.stringify(null)),
  arbitraryNameToken().map((value) => JSON.stringify(value)),
  fc.integer().map((value) => JSON.stringify(value)),
  fc.boolean().map((value) => JSON.stringify(value)),
  fc.constant(JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: null })),
  arbitraryNameToken().map((value) => JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: value })),
  fc.integer().map((value) => JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: value })),
  fc.boolean().map((value) => JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: value })),
  fc.dictionary(arbitraryNameToken(), arbitraryNameToken()).map((value) =>
    JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: value })
  ),
  ...[
    fc.constant(""),
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.array(arbitraryNameToken()),
    fc.dictionary(arbitraryNameToken(), arbitraryNameToken()),
  ].map((invalidClass) =>
    invalidClass.map((invalid) => JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [invalid] }))
  ),
];

/** Serializes manifest facts to the manifest JSON, emitting only the consumer facts the selected checks require. */
export function manifestJson(facts: ManifestFacts): string {
  const body: Record<string, unknown> = { [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: facts.checks };
  if (facts.checks.includes(CHECK_NAME.SPX_REACHABILITY)) {
    body[DIAGNOSE_MANIFEST_FIELDS.SPX_FLOOR] = facts.spxFloor;
  }
  if (facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
    body[DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY] = {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
    };
  }
  return JSON.stringify(body);
}
