/**
 * Pure variable input domains for the source graph: artifact paths, provider
 * provenance, per-classification ownership scenarios, multi-artifact graph
 * scenarios, raw-fact normalization scenarios, and unattributable
 * direct-parse fixtures.
 *
 * Every scenario is coherent data: the facts, evidence links, and inventory
 * it emits agree on one expected outcome derived from the seed values, never
 * from a stored expected output.
 *
 * @module testing/generators/outcomeeng/source-graph
 */

import { posix, win32 } from "node:path";

import * as fc from "fast-check";

import { PATH_CONTAINMENT_PARENT_DIRECTORY } from "@/lib/file-system/pathContainment";
import {
  formatUnattributableProviderFactError,
  formatUnresolvableProviderFactPathError,
  type NormalizedProviderFact,
  PROVIDER_FACT_KIND,
  type ProviderFactKind,
  type ProviderFactProvenance,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  SOURCE_OWNERSHIP_CLASSIFICATION,
  type SourceGraphLanguage,
  type SourceOwnershipClassification,
  type SourceOwnershipInput,
} from "@/outcomeeng/spec-tree/graph/source";

const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{0,8}$/;
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{2,16}$/;
/** Adjacent directory sharing the product directory's prefix; exposes prefix-only containment bugs. */
const PREFIX_ADJACENT_SUFFIX = "-adjacent";
/** Namespace prefix isolating each merged per-artifact scenario's paths. */
const GRAPH_ARTIFACT_NAMESPACE = "artifact";
/** Drive letter used when a canonical path yields none. */
const FALLBACK_DRIVE_LETTER = "c";
/** Designator between a drive letter and its root separator in a Windows drive-rooted path. */
const WINDOWS_DRIVE_DESIGNATOR = ":";
/** Current-directory segment for redundant-segment encodings. */
const CURRENT_DIRECTORY_SEGMENT = ".";

/** One registered language drawn from the source-owned registry. */
export function arbitrarySourceGraphLanguage(): fc.Arbitrary<SourceGraphLanguage> {
  return fc.constantFrom(...Object.values(SOURCE_GRAPH_LANGUAGE));
}

/** Validated provenance: a registered language and a named provider. */
export function arbitraryProviderFactProvenance(): fc.Arbitrary<ProviderFactProvenance> {
  // fc.record emits null-prototype objects; provenance leaves the generator as an ordinary object literal.
  return fc
    .record({
      language: arbitrarySourceGraphLanguage(),
      provider: fc.stringMatching(PROVIDER_ID_PATTERN),
    })
    .map((provenance) => ({ language: provenance.language, provider: provenance.provider }));
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT_PATTERN);
}

/** A canonical product-root-relative artifact path with at least one directory segment. */
export function arbitraryArtifactPath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 3 }),
      arbitraryPathSegment(),
      arbitraryPathSegment(),
    )
    .map(([directories, name, extension]) => [...directories, `${name}.${extension}`].join(posix.sep));
}

/** An ownership scenario for one source artifact: coherent input plus the classification it must produce. */
export interface OwnershipScenario {
  readonly expected: SourceOwnershipClassification;
  readonly input: SourceOwnershipInput;
  readonly sourcePath: string;
}

interface OwnershipScenarioSeed {
  readonly paths: readonly string[];
  readonly linkedProvenance: ProviderFactProvenance;
  readonly unlinkedProvenance: ProviderFactProvenance;
  readonly withLinkedReachabilityNoise: boolean;
  readonly withUnlinkedCoverageNoise: boolean;
  readonly withUnlinkedReachabilityNoise: boolean;
}

function providerFact(
  kind: ProviderFactKind,
  testPath: string,
  sourcePath: string,
  provenance: ProviderFactProvenance,
): NormalizedProviderFact {
  return { kind, testPath, sourcePath, provenance };
}

/**
 * Facts for one target classification. Lower-precedence facts join as noise
 * so the scenario proves precedence, never just presence.
 */
function scenarioFacts(
  classification: SourceOwnershipClassification,
  seed: OwnershipScenarioSeed,
): readonly NormalizedProviderFact[] {
  const [sourcePath, linkedTestPath, unlinkedTestPath] = seed.paths;
  const linkedCoverage = providerFact(PROVIDER_FACT_KIND.COVERAGE, linkedTestPath, sourcePath, seed.linkedProvenance);
  const linkedReachability = providerFact(
    PROVIDER_FACT_KIND.REACHABILITY,
    linkedTestPath,
    sourcePath,
    seed.linkedProvenance,
  );
  const unlinkedCoverage = providerFact(
    PROVIDER_FACT_KIND.COVERAGE,
    unlinkedTestPath,
    sourcePath,
    seed.unlinkedProvenance,
  );
  const unlinkedReachability = providerFact(
    PROVIDER_FACT_KIND.REACHABILITY,
    unlinkedTestPath,
    sourcePath,
    seed.unlinkedProvenance,
  );
  switch (classification) {
    case SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_COVERED:
      return [
        linkedCoverage,
        ...(seed.withLinkedReachabilityNoise ? [linkedReachability] : []),
        ...(seed.withUnlinkedCoverageNoise ? [unlinkedCoverage] : []),
        ...(seed.withUnlinkedReachabilityNoise ? [unlinkedReachability] : []),
      ];
    case SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_REACHABLE:
      return [
        linkedReachability,
        ...(seed.withUnlinkedCoverageNoise ? [unlinkedCoverage] : []),
        ...(seed.withUnlinkedReachabilityNoise ? [unlinkedReachability] : []),
      ];
    case SOURCE_OWNERSHIP_CLASSIFICATION.COVERED_UNOWNED:
      return [unlinkedCoverage, ...(seed.withUnlinkedReachabilityNoise ? [unlinkedReachability] : [])];
    case SOURCE_OWNERSHIP_CLASSIFICATION.REACHABLE_UNOWNED:
      return [unlinkedReachability];
    case SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED:
      return [];
  }
}

/** A coherent ownership scenario whose input must classify to `classification`. */
export function arbitraryOwnershipScenario(
  classification: SourceOwnershipClassification,
): fc.Arbitrary<OwnershipScenario> {
  return fc
    .record({
      paths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 3, maxLength: 3 }),
      linkedProvenance: arbitraryProviderFactProvenance(),
      unlinkedProvenance: arbitraryProviderFactProvenance(),
      withLinkedReachabilityNoise: fc.boolean(),
      withUnlinkedCoverageNoise: fc.boolean(),
      withUnlinkedReachabilityNoise: fc.boolean(),
    })
    .map((seed) => {
      const [sourcePath, linkedTestPath] = seed.paths;
      return {
        expected: classification,
        sourcePath,
        input: {
          sourceArtifacts: [sourcePath],
          evidenceLinks: [{ testPath: linkedTestPath }],
          facts: scenarioFacts(classification, seed),
        },
      };
    });
}

/** A scenario for any classification drawn from the source-owned vocabulary. */
export function arbitraryAnyOwnershipScenario(): fc.Arbitrary<OwnershipScenario> {
  return fc
    .constantFrom(...Object.values(SOURCE_OWNERSHIP_CLASSIFICATION))
    .chain((classification) => arbitraryOwnershipScenario(classification));
}

/** A multi-artifact scenario: disjoint per-artifact scenarios merged into one input. */
export interface OwnershipGraphScenario {
  readonly input: SourceOwnershipInput;
  readonly expectedBySourcePath: ReadonlyMap<string, SourceOwnershipClassification>;
}

function prefixPath(prefix: string, path: string): string {
  return `${prefix}${posix.sep}${path}`;
}

function prefixScenario(scenario: OwnershipScenario, prefix: string): OwnershipScenario {
  return {
    expected: scenario.expected,
    sourcePath: prefixPath(prefix, scenario.sourcePath),
    input: {
      sourceArtifacts: scenario.input.sourceArtifacts.map((path) => prefixPath(prefix, path)),
      evidenceLinks: scenario.input.evidenceLinks.map((link) => ({ testPath: prefixPath(prefix, link.testPath) })),
      facts: scenario.input.facts.map((fact) => ({
        ...fact,
        testPath: prefixPath(prefix, fact.testPath),
        sourcePath: prefixPath(prefix, fact.sourcePath),
      })),
    },
  };
}

/** A merged graph over disjoint per-artifact scenarios with the expected classification per artifact. */
export function arbitraryOwnershipGraphScenario(): fc.Arbitrary<OwnershipGraphScenario> {
  return fc.array(arbitraryAnyOwnershipScenario(), { minLength: 1, maxLength: 4 }).map((scenarios) => {
    const prefixed = scenarios.map((scenario, index) =>
      prefixScenario(scenario, `${GRAPH_ARTIFACT_NAMESPACE}-${index}`)
    );
    return {
      input: {
        sourceArtifacts: prefixed.flatMap((scenario) => scenario.input.sourceArtifacts),
        evidenceLinks: prefixed.flatMap((scenario) => scenario.input.evidenceLinks),
        facts: prefixed.flatMap((scenario) => scenario.input.facts),
      },
      expectedBySourcePath: new Map(prefixed.map((scenario) => [scenario.sourcePath, scenario.expected])),
    };
  });
}

/** Encodings a provider-native path may arrive in; each binds the same canonical identity. */
export const RAW_PATH_ENCODING = {
  PLAIN: "plain",
  DOT_SLASH: "dot-slash",
  ABSOLUTE: "absolute",
  INNER_DOT: "inner-dot",
} as const;

export type RawPathEncoding = (typeof RAW_PATH_ENCODING)[keyof typeof RAW_PATH_ENCODING];

function encodeRawPath(encoding: RawPathEncoding, productDir: string, canonicalPath: string): string {
  switch (encoding) {
    case RAW_PATH_ENCODING.PLAIN:
      return canonicalPath;
    case RAW_PATH_ENCODING.DOT_SLASH:
      return `${CURRENT_DIRECTORY_SEGMENT}${posix.sep}${canonicalPath}`;
    case RAW_PATH_ENCODING.ABSOLUTE:
      return `${productDir}/${canonicalPath}`;
    case RAW_PATH_ENCODING.INNER_DOT: {
      const [head, ...rest] = canonicalPath.split(posix.sep);
      return [head, CURRENT_DIRECTORY_SEGMENT, ...rest].join(posix.sep);
    }
  }
}

/** A raw fact whose messy path encodings must normalize to the canonical identities. */
export interface NormalizationScenario {
  readonly productDir: string;
  readonly raw: RawProviderFact;
  readonly kind: ProviderFactKind;
  readonly provenance: ProviderFactProvenance;
  readonly canonicalTestPath: string;
  readonly canonicalSourcePath: string;
}

function arbitraryProductDir(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: 2 })
    .map((segments) => `${posix.sep}${segments.join(posix.sep)}`);
}

/** A coherent normalization scenario: canonical identities, one encoding per path, valid attribution. */
export function arbitraryNormalizationScenario(): fc.Arbitrary<NormalizationScenario> {
  return fc
    .record({
      productDir: arbitraryProductDir(),
      paths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 2, maxLength: 2 }),
      testEncoding: fc.constantFrom(...Object.values(RAW_PATH_ENCODING)),
      sourceEncoding: fc.constantFrom(...Object.values(RAW_PATH_ENCODING)),
      kind: fc.constantFrom(...Object.values(PROVIDER_FACT_KIND)),
      provenance: arbitraryProviderFactProvenance(),
    })
    .map((seed) => {
      const [canonicalTestPath, canonicalSourcePath] = seed.paths;
      return {
        productDir: seed.productDir,
        kind: seed.kind,
        provenance: seed.provenance,
        canonicalTestPath,
        canonicalSourcePath,
        raw: {
          kind: seed.kind,
          testPath: encodeRawPath(seed.testEncoding, seed.productDir, canonicalTestPath),
          sourcePath: encodeRawPath(seed.sourceEncoding, seed.productDir, canonicalSourcePath),
          provenance: seed.provenance,
        },
      };
    });
}

/** Path shapes that bind no product-root-relative identity. */
export const UNRESOLVABLE_PATH_VARIANT = {
  PARENT_ESCAPE: "parent-escape",
  NESTED_ESCAPE: "nested-escape",
  BARE_PARENT: "bare-parent",
  FOREIGN_ABSOLUTE: "foreign-absolute",
  WINDOWS_DRIVE_ABSOLUTE: "windows-drive-absolute",
  WINDOWS_UNC_ABSOLUTE: "windows-unc-absolute",
  ROOT_PARENT_CANCEL: "root-parent-cancel",
  ROOT_CURRENT_DIRECTORY: "root-current-directory",
  EMPTY: "empty",
} as const;

export type UnresolvablePathVariant = (typeof UNRESOLVABLE_PATH_VARIANT)[keyof typeof UNRESOLVABLE_PATH_VARIANT];

/** The fact fields a path occupies; either must reject an unresolvable path. */
export const PROVIDER_FACT_PATH_FIELD = {
  TEST_PATH: "testPath",
  SOURCE_PATH: "sourcePath",
} as const;

export type ProviderFactPathField = (typeof PROVIDER_FACT_PATH_FIELD)[keyof typeof PROVIDER_FACT_PATH_FIELD];

function encodeUnresolvablePath(variant: UnresolvablePathVariant, productDir: string, canonicalPath: string): string {
  switch (variant) {
    case UNRESOLVABLE_PATH_VARIANT.PARENT_ESCAPE:
      return `${PATH_CONTAINMENT_PARENT_DIRECTORY}${posix.sep}${canonicalPath}`;
    case UNRESOLVABLE_PATH_VARIANT.NESTED_ESCAPE: {
      const [head, ...rest] = canonicalPath.split(posix.sep);
      return [head, PATH_CONTAINMENT_PARENT_DIRECTORY, PATH_CONTAINMENT_PARENT_DIRECTORY, ...rest].join(posix.sep);
    }
    case UNRESOLVABLE_PATH_VARIANT.BARE_PARENT: {
      const [head] = canonicalPath.split(posix.sep);
      return [head, PATH_CONTAINMENT_PARENT_DIRECTORY, PATH_CONTAINMENT_PARENT_DIRECTORY].join(posix.sep);
    }
    case UNRESOLVABLE_PATH_VARIANT.FOREIGN_ABSOLUTE:
      return `${productDir}${PREFIX_ADJACENT_SUFFIX}${posix.sep}${canonicalPath}`;
    case UNRESOLVABLE_PATH_VARIANT.WINDOWS_DRIVE_ABSOLUTE: {
      const [drive] = canonicalPath;
      return `${(drive ?? FALLBACK_DRIVE_LETTER).toUpperCase()}${WINDOWS_DRIVE_DESIGNATOR}${win32.sep}${
        canonicalPath.split(posix.sep).join(win32.sep)
      }`;
    }
    case UNRESOLVABLE_PATH_VARIANT.WINDOWS_UNC_ABSOLUTE: {
      const [head, ...rest] = canonicalPath.split(posix.sep);
      return `${win32.sep}${win32.sep}${head}${win32.sep}${rest.join(win32.sep)}`;
    }
    case UNRESOLVABLE_PATH_VARIANT.ROOT_PARENT_CANCEL: {
      const [head] = canonicalPath.split(posix.sep);
      return [head, PATH_CONTAINMENT_PARENT_DIRECTORY].join(posix.sep);
    }
    case UNRESOLVABLE_PATH_VARIANT.ROOT_CURRENT_DIRECTORY:
      return CURRENT_DIRECTORY_SEGMENT;
    case UNRESOLVABLE_PATH_VARIANT.EMPTY:
      return "";
  }
}

/** A validly attributed fact carrying one unresolvable path, plus the exact diagnostic its rejection must carry. */
export interface UnresolvablePathFixture {
  readonly productDir: string;
  readonly fact: RawProviderFact;
  readonly expectedDiagnostic: string;
}

/** A fixture whose test or source path escapes, leaves, or never enters the product directory. */
export function arbitraryUnresolvablePathFixture(): fc.Arbitrary<UnresolvablePathFixture> {
  return fc
    .record({
      variant: fc.constantFrom(...Object.values(UNRESOLVABLE_PATH_VARIANT)),
      field: fc.constantFrom(...Object.values(PROVIDER_FACT_PATH_FIELD)),
      productDir: arbitraryProductDir(),
      paths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 2, maxLength: 2 }),
      kind: fc.constantFrom(...Object.values(PROVIDER_FACT_KIND)),
      provenance: arbitraryProviderFactProvenance(),
    })
    .map((seed) => {
      const [validPath, escapeSeedPath] = seed.paths;
      const unresolvablePath = encodeUnresolvablePath(seed.variant, seed.productDir, escapeSeedPath);
      return {
        productDir: seed.productDir,
        expectedDiagnostic: formatUnresolvableProviderFactPathError(unresolvablePath),
        fact: {
          kind: seed.kind,
          testPath: seed.field === PROVIDER_FACT_PATH_FIELD.TEST_PATH ? unresolvablePath : validPath,
          sourcePath: seed.field === PROVIDER_FACT_PATH_FIELD.SOURCE_PATH ? unresolvablePath : validPath,
          provenance: seed.provenance,
        },
      };
    });
}

/** Attribution violations: the shapes a direct implementation-source parse would produce. */
export const UNATTRIBUTABLE_FACT_VARIANT = {
  BLANK_PROVIDER: "blank-provider",
  UNREGISTERED_LANGUAGE: "unregistered-language",
  UNREGISTERED_KIND: "unregistered-kind",
} as const;

export type UnattributableFactVariant = (typeof UNATTRIBUTABLE_FACT_VARIANT)[keyof typeof UNATTRIBUTABLE_FACT_VARIANT];

/** An unattributable fact fixture plus the exact diagnostic its rejection must carry. */
export interface DirectParseFixture {
  readonly productDir: string;
  readonly fact: RawProviderFact;
  readonly expectedDiagnostic: string;
}

function isRegisteredLanguageValue(value: string): boolean {
  return (Object.values(SOURCE_GRAPH_LANGUAGE) as readonly string[]).includes(value);
}

function isRegisteredKindValue(value: string): boolean {
  return (Object.values(PROVIDER_FACT_KIND) as readonly string[]).includes(value);
}

function arbitraryUnattributableSeed(
  variant: UnattributableFactVariant,
): fc.Arbitrary<{ readonly kind: string; readonly language: string; readonly provider: string }> {
  switch (variant) {
    case UNATTRIBUTABLE_FACT_VARIANT.BLANK_PROVIDER:
      return fc.record({
        kind: fc.constantFrom(...Object.values(PROVIDER_FACT_KIND)),
        language: arbitrarySourceGraphLanguage(),
        provider: fc.string({ maxLength: 2 }).filter((value) => value.trim().length === 0),
      });
    case UNATTRIBUTABLE_FACT_VARIANT.UNREGISTERED_LANGUAGE:
      return fc.record({
        kind: fc.constantFrom(...Object.values(PROVIDER_FACT_KIND)),
        language: arbitraryPathSegment().filter((value) => !isRegisteredLanguageValue(value)),
        provider: fc.stringMatching(PROVIDER_ID_PATTERN),
      });
    case UNATTRIBUTABLE_FACT_VARIANT.UNREGISTERED_KIND:
      return fc.record({
        kind: arbitraryPathSegment().filter((value) => !isRegisteredKindValue(value)),
        language: arbitrarySourceGraphLanguage(),
        provider: fc.stringMatching(PROVIDER_ID_PATTERN),
      });
  }
}

/** A direct-parse fixture: valid paths, no provider attribution, and the diagnostic that names it. */
export function arbitraryDirectParseFixture(): fc.Arbitrary<DirectParseFixture> {
  return fc
    .record({
      variant: fc.constantFrom(...Object.values(UNATTRIBUTABLE_FACT_VARIANT)),
      productDir: arbitraryProductDir(),
      paths: fc.uniqueArray(arbitraryArtifactPath(), { minLength: 2, maxLength: 2 }),
    })
    .chain((seed) =>
      arbitraryUnattributableSeed(seed.variant).map((attribution) => {
        const [testPath, sourcePath] = seed.paths;
        const fact: RawProviderFact = {
          kind: attribution.kind,
          testPath,
          sourcePath,
          provenance: { language: attribution.language, provider: attribution.provider },
        };
        return {
          productDir: seed.productDir,
          fact,
          expectedDiagnostic: formatUnattributableProviderFactError(fact),
        };
      })
    );
}
