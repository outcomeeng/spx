/**
 * Generators for diagnose manifest inputs — the consumer-varying facts a
 * manifest carries (the spx-version floor, the marketplace identity, the
 * expected plugin set, methodology selection, and the check set). Source-owned
 * field and check names come from production modules; variable facts and invalid
 * shapes are drawn from input domains so tests exercise the manifest contract
 * across the space rather than one hand-picked manifest.
 *
 * @module testing/generators/diagnose/manifest
 */

import fc from "fast-check";

import { isMethodologySource, METHODOLOGY_CONFIG_FIELDS } from "@/config/methodology";
import { MARKETPLACE_IDENTITY_FIELDS } from "@/domains/diagnose/facts";
import { CHECK_NAME, type CheckName, DIAGNOSE_MANIFEST_FIELDS } from "@/domains/diagnose/manifest";

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

/** A non-empty whitespace-free token used for plugin, marketplace, reading, and remediation values. */
export const arbitraryNameToken = (): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength: 24 })
    .map((value) => value.replaceAll(/\s/g, ""))
    .filter((value) => value.length > 0);

/** A marketplace `owner/repo` source. */
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
  readonly marketplaceName: string;
  readonly marketplaceSource: string;
  readonly methodologySource: string;
  readonly methodologyVersion: string;
  readonly expectedPlugins: readonly string[];
}

/** A coherent set of manifest facts with a non-empty, duplicate-free check set. */
export const arbitraryManifestFacts = (): fc.Arbitrary<ManifestFacts> =>
  fc.record({
    checks: fc.uniqueArray(arbitraryCheckName(), { minLength: 1 }),
    spxFloor: arbitrarySpxFloor(),
    marketplaceName: arbitraryNameToken(),
    marketplaceSource: arbitraryMarketplaceSource(),
    methodologySource: arbitraryMethodologySource(),
    methodologyVersion: arbitraryNameToken(),
    expectedPlugins: fc.array(arbitraryNameToken(), { minLength: 1, maxLength: 5 }),
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

const invalidPluginMemberClasses = (): readonly fc.Arbitrary<unknown>[] => [
  fc.constant(""),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.array(arbitraryNameToken()),
  fc.dictionary(arbitraryNameToken(), arbitraryNameToken()),
];

const invalidExpectedPluginClasses = (): readonly fc.Arbitrary<unknown>[] => [
  fc.constant([]),
  fc.constant(null),
  arbitraryNameToken(),
  fc.integer(),
  fc.boolean(),
  fc.dictionary(arbitraryNameToken(), arbitraryNameToken()),
  ...invalidPluginMemberClasses().map((invalidClass) => invalidClass.map((invalid) => [invalid])),
  ...invalidPluginMemberClasses().map((invalidClass) =>
    fc.tuple(arbitraryNameToken(), invalidClass).map(([valid, invalid]) => [valid, invalid])
  ),
];

const methodologyFieldNames = (): ReadonlySet<string> => new Set(Object.values(METHODOLOGY_CONFIG_FIELDS));

const arbitraryUnknownMethodologyField = (): fc.Arbitrary<string> =>
  arbitraryNameToken().filter((field) => !methodologyFieldNames().has(field));

function marketplaceIdentity(facts: ManifestFacts): Record<string, string> {
  return {
    [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
    [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
  };
}

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
  fc.constant(JSON.stringify({ [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL] })),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
      [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
    })
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
      [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
        [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
        [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
      },
    })
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
      [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
        [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
        [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
      },
      [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: [],
    })
  ),
  ...invalidRecordContainerClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
        [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: invalid,
        [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
      })
    )
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
      [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
        [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
      },
      [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
    })
  ),
  arbitraryManifestFacts().map((facts) =>
    JSON.stringify({
      [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
      [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
        [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
      },
      [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
    })
  ),
  ...invalidRequiredStringClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
        [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
          [MARKETPLACE_IDENTITY_FIELDS.NAME]: invalid,
          [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
        },
        [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
      })
    )
  ),
  ...invalidRequiredStringClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
        [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: {
          [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
          [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: invalid,
        },
        [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: facts.expectedPlugins,
      })
    )
  ),
  ...invalidExpectedPluginClasses().map((invalidClass) =>
    fc.tuple(arbitraryManifestFacts(), invalidClass).map(([facts, invalid]) =>
      JSON.stringify({
        [DIAGNOSE_MANIFEST_FIELDS.CHECKS]: [CHECK_NAME.MARKETPLACE_INSTALL],
        [DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE]: marketplaceIdentity(facts),
        [DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS]: invalid,
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
  if (facts.checks.includes(CHECK_NAME.MARKETPLACE_INSTALL)) {
    body[DIAGNOSE_MANIFEST_FIELDS.MARKETPLACE] = {
      [MARKETPLACE_IDENTITY_FIELDS.NAME]: facts.marketplaceName,
      [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: facts.marketplaceSource,
    };
    body[DIAGNOSE_MANIFEST_FIELDS.EXPECTED_PLUGINS] = facts.expectedPlugins;
  }
  if (facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
    body[DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY] = {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
    };
  }
  return JSON.stringify(body);
}
