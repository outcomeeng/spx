/**
 * Generators for diagnose manifest inputs — the consumer-varying facts a
 * manifest carries (the spx-version floor, the marketplace identity, the
 * expected plugin set, and the check set). Source-owned check names come from
 * the production module; the variable facts are drawn from the input domains so
 * tests exercise the manifest contract across the space rather than one
 * hand-picked manifest.
 *
 * @module testing/generators/diagnose/manifest
 */

import fc from "fast-check";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { CHECK_NAME, type CheckName } from "@/domains/diagnose/manifest";

const DIAGNOSE_SAMPLE_SEED = 7;
const METHODOLOGY_SOURCE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

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
  fc
    .tuple(
      arbitraryNameToken().filter((segment) => METHODOLOGY_SOURCE_SEGMENT_PATTERN.test(segment)),
      arbitraryNameToken().filter((segment) => METHODOLOGY_SOURCE_SEGMENT_PATTERN.test(segment)),
    )
    .map(([owner, repo]) => `${owner}/${repo}`);

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

/** Serializes manifest facts to the manifest JSON, emitting only the consumer facts the selected checks require. */
export function manifestJson(facts: ManifestFacts): string {
  const body: Record<string, unknown> = { checks: facts.checks };
  if (facts.checks.includes(CHECK_NAME.SPX_REACHABILITY)) {
    body.spx_floor = facts.spxFloor;
  }
  if (facts.checks.includes(CHECK_NAME.MARKETPLACE_INSTALL)) {
    body.marketplace = { name: facts.marketplaceName, source: facts.marketplaceSource };
    body.expected_plugins = facts.expectedPlugins;
  }
  if (facts.checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
    body[METHODOLOGY_SECTION] = {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: facts.methodologySource,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: facts.methodologyVersion,
    };
  }
  return JSON.stringify(body);
}
