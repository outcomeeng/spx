/**
 * Product-root-relative identity and provenance normalization for provider
 * facts. Normalization is the trust boundary: raw facts arrive as untrusted
 * strings, and only facts attributable to a registered language, a registered
 * fact kind, and a named provider bind normalized identities that retain
 * their provenance.
 *
 * @module outcomeeng/spec-tree/graph/source/normalize/identity
 */

import { posix } from "node:path";

import {
  PROVIDER_FACT_KIND,
  type ProviderFactKind,
  type ProviderFactProvenance,
  type RawProviderFact,
  SOURCE_GRAPH_LANGUAGE,
  type SourceGraphLanguage,
} from "../providers/descriptor";

/** A provider fact carrying product-root-relative identities and validated provenance. */
export interface NormalizedProviderFact {
  readonly kind: ProviderFactKind;
  readonly testPath: string;
  readonly sourcePath: string;
  readonly provenance: ProviderFactProvenance;
}

/** Diagnostic for a fact no registered provider contract attributes — the direct-parse shape binds nothing. */
export function formatUnattributableProviderFactError(fact: RawProviderFact): string {
  return `Source graph fact is not attributable to a registered provider: `
    + `kind=${fact.kind} language=${fact.provenance.language} provider=${fact.provenance.provider}`;
}

/** Diagnostic for a fact path that binds no product-root-relative identity; names the exact path. */
export function formatUnresolvableProviderFactPathError(path: string): string {
  return `Source graph fact path does not resolve inside the product directory: ${path}`;
}

const PATH_SEPARATOR = "/";
const WINDOWS_SEPARATOR = "\\";
const PARENT_SEGMENT_PREFIX = "../";
const CURRENT_DIRECTORY = ".";

function isRegisteredLanguage(language: string): language is SourceGraphLanguage {
  return (Object.values(SOURCE_GRAPH_LANGUAGE) as readonly string[]).includes(language);
}

function isRegisteredFactKind(kind: string): kind is ProviderFactKind {
  return (Object.values(PROVIDER_FACT_KIND) as readonly string[]).includes(kind);
}

/**
 * Normalizes one raw path to a product-root-relative POSIX identity. An
 * absolute path binds only under `productDir`; a relative path binds only
 * when it stays inside the product directory.
 */
function normalizeArtifactPath(productDir: string, rawPath: string): string {
  const posixPath = rawPath.split(WINDOWS_SEPARATOR).join(PATH_SEPARATOR);
  const posixProductDir = productDir.split(WINDOWS_SEPARATOR).join(PATH_SEPARATOR);
  const productPrefix = posixProductDir.endsWith(PATH_SEPARATOR)
    ? posixProductDir
    : `${posixProductDir}${PATH_SEPARATOR}`;
  const relativePath = posixPath.startsWith(productPrefix) ? posixPath.slice(productPrefix.length) : posixPath;
  const normalized = posix.normalize(relativePath);
  if (
    normalized.length === 0
    || normalized === CURRENT_DIRECTORY
    || posix.isAbsolute(normalized)
    || normalized === PARENT_SEGMENT_PREFIX.slice(0, 2)
    || normalized.startsWith(PARENT_SEGMENT_PREFIX)
  ) {
    throw new Error(formatUnresolvableProviderFactPathError(rawPath));
  }
  return normalized;
}

/**
 * Validates and normalizes one raw provider fact. Throws when the fact is not
 * attributable to a registered provider contract or when a path binds no
 * product-root-relative identity.
 */
export function normalizeProviderFact(productDir: string, fact: RawProviderFact): NormalizedProviderFact {
  if (
    !isRegisteredFactKind(fact.kind)
    || !isRegisteredLanguage(fact.provenance.language)
    || fact.provenance.provider.trim().length === 0
  ) {
    throw new Error(formatUnattributableProviderFactError(fact));
  }
  return {
    kind: fact.kind,
    testPath: normalizeArtifactPath(productDir, fact.testPath),
    sourcePath: normalizeArtifactPath(productDir, fact.sourcePath),
    provenance: {
      language: fact.provenance.language,
      provider: fact.provenance.provider,
    },
  };
}
