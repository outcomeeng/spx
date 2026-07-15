/**
 * Product-root-relative identity and provenance normalization for provider
 * facts. Normalization is the trust boundary: raw facts arrive as untrusted
 * strings, and only facts attributable to a registered language, a registered
 * fact kind, and a named provider bind normalized identities that retain
 * their provenance.
 *
 * Containment follows the canonical predicates in
 * `src/lib/file-system/pathContainment.ts`: a Windows-rooted raw path never
 * binds under a product directory this slice addresses, and every other raw
 * path binds only when it resolves inside the product directory. No separator
 * rewriting happens — a backslash is a literal POSIX filename character, so a
 * raw path is never silently reshaped into a different identity.
 *
 * @module outcomeeng/spec-tree/graph/source/normalize/identity
 */

import { posix } from "node:path";

import { isPathContained, usesWindowsPathSemantics } from "@/lib/file-system/pathContainment";
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

function isRegisteredLanguage(language: string): language is SourceGraphLanguage {
  return (Object.values(SOURCE_GRAPH_LANGUAGE) as readonly string[]).includes(language);
}

function isRegisteredFactKind(kind: string): kind is ProviderFactKind {
  return (Object.values(PROVIDER_FACT_KIND) as readonly string[]).includes(kind);
}

/**
 * Normalizes one raw path to a product-root-relative POSIX identity. A path
 * binds only when it resolves inside the product directory and is not the
 * product directory itself; Windows-rooted paths never bind.
 */
function normalizeArtifactPath(productDir: string, rawPath: string): string {
  if (
    rawPath.length === 0
    || usesWindowsPathSemantics(rawPath)
    || !isPathContained(productDir, rawPath)
  ) {
    throw new Error(formatUnresolvableProviderFactPathError(rawPath));
  }
  const normalized = posix.relative(productDir, posix.resolve(productDir, rawPath));
  if (normalized.length === 0) {
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
