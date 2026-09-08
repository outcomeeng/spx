/**
 * The check between a product's methodology declaration and the provider
 * declaration a shipped line's source record carries: the declared version
 * must equal `provides`, and a declared migration source must fall within
 * `supports`. A record without a provider declaration yields an undeclared
 * match, never a verified one.
 *
 * `supports` is read as comparator sets — `>=3.2.0 <5.0.0`, joined by `||`
 * for alternatives, or one exact version — evaluated by SemVer precedence over
 * the numeric components and prerelease identifiers.
 *
 * @module lib/methodology/provider-match
 */

import type { Result } from "@/config/types";

import { METHODOLOGY_VERSION_PATTERN, type MethodologySourceRecord } from "./tree";

export const PROVIDER_MATCH = {
  VERIFIED: "verified",
  UNDECLARED: "undeclared",
} as const;

export type ProviderMatch = (typeof PROVIDER_MATCH)[keyof typeof PROVIDER_MATCH];

export interface ProviderMatchInput {
  readonly version: string;
  readonly migratingFrom?: string;
  readonly sourceRecord: MethodologySourceRecord | undefined;
  /** The coding agent whose plugin declaration is checked. */
  readonly codingAgent: string;
}

/** The comparator operators a `supports` range composes; a bare version reads as an exact match. */
export const RANGE_COMPARATOR = {
  GREATER_OR_EQUAL: ">=",
  LESS_OR_EQUAL: "<=",
  GREATER: ">",
  LESS: "<",
  EQUAL: "=",
} as const;

/** Alternatives of a `supports` range are joined by this token. */
export const RANGE_ALTERNATIVE_SEPARATOR = "||";
const COMPARATOR_SEPARATOR = /\s+/;
const COMPARATOR_PATTERN = new RegExp(`^(${Object.values(RANGE_COMPARATOR).join("|")})?(.+)$`);
const PRERELEASE_SEPARATOR = "-";
const BUILD_SEPARATOR = "+";
const COMPONENT_SEPARATOR = ".";
const NUMERIC_PATTERN = /^\d+$/;

interface ParsedVersion {
  readonly components: readonly number[];
  readonly prerelease: readonly string[];
}

function parseVersion(text: string): ParsedVersion | undefined {
  if (!METHODOLOGY_VERSION_PATTERN.test(text)) return undefined;
  const withoutBuild = text.split(BUILD_SEPARATOR)[0];
  const prereleaseIndex = withoutBuild.indexOf(PRERELEASE_SEPARATOR);
  const core = prereleaseIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex);
  const prerelease = prereleaseIndex === -1 ? [] : withoutBuild.slice(prereleaseIndex + 1).split(COMPONENT_SEPARATOR);
  return { components: core.split(COMPONENT_SEPARATOR).map(Number), prerelease };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = NUMERIC_PATTERN.test(left);
  const rightNumeric = NUMERIC_PATTERN.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** SemVer precedence: numeric components, then a prerelease sorts below its release, then identifier order. */
function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (let index = 0; index < left.components.length; index += 1) {
    const difference = (left.components[index] ?? 0) - (right.components[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const shared = Math.min(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (difference !== 0) return difference;
  }
  return left.prerelease.length - right.prerelease.length;
}

function satisfiesComparator(version: ParsedVersion, comparator: string): Result<boolean> {
  const match = COMPARATOR_PATTERN.exec(comparator);
  if (match === null) {
    return { ok: false, error: `unrecognized comparator ${JSON.stringify(comparator)}` };
  }
  const bound = parseVersion(match[2]);
  if (bound === undefined) {
    return { ok: false, error: `comparator names no exact version: ${JSON.stringify(comparator)}` };
  }
  const difference = compareVersions(version, bound);
  switch (match[1]) {
    case RANGE_COMPARATOR.GREATER_OR_EQUAL:
      return { ok: true, value: difference >= 0 };
    case RANGE_COMPARATOR.LESS_OR_EQUAL:
      return { ok: true, value: difference <= 0 };
    case RANGE_COMPARATOR.GREATER:
      return { ok: true, value: difference > 0 };
    case RANGE_COMPARATOR.LESS:
      return { ok: true, value: difference < 0 };
    default:
      return { ok: true, value: difference === 0 };
  }
}

/** Whether an exact version falls within a `supports` range. */
export function satisfiesMethodologyRange(version: string, range: string): Result<boolean> {
  const parsed = parseVersion(version);
  if (parsed === undefined) {
    return { ok: false, error: `not an exact methodology version: ${JSON.stringify(version)}` };
  }
  for (const alternative of range.split(RANGE_ALTERNATIVE_SEPARATOR)) {
    const comparators = alternative.trim().split(COMPARATOR_SEPARATOR).filter((part) => part.length > 0);
    if (comparators.length === 0) {
      return { ok: false, error: `empty range alternative in ${JSON.stringify(range)}` };
    }
    let satisfied = true;
    for (const comparator of comparators) {
      const result = satisfiesComparator(parsed, comparator);
      if (!result.ok) return result;
      satisfied &&= result.value;
    }
    if (satisfied) return { ok: true, value: true };
  }
  return { ok: true, value: false };
}

/** Diagnostic for a declared version the provider does not provide. */
export function formatProvidesMismatchError(version: string, provides: string, codingAgent: string): string {
  return `Declared methodology version ${version} differs from the version the ${codingAgent} plugin provides, ${provides}`;
}

/** Diagnostic for a declared migration source the provider records no supported range for. */
export function formatSupportsUndeclaredError(migratingFrom: string, codingAgent: string): string {
  return `Declared migration source ${migratingFrom} cannot be checked: the ${codingAgent} plugin declares no supported range`;
}

/** Diagnostic for a declared migration source outside the provider's supported range. */
export function formatSupportsMismatchError(migratingFrom: string, supports: string, codingAgent: string): string {
  return `Declared migration source ${migratingFrom} falls outside the range the ${codingAgent} plugin supports, ${supports}`;
}

/**
 * Checks the product's declaration against the provider declaration recorded
 * for the coding agent, failing on a mismatch and reporting `undeclared` when
 * the record carries no `provides`. A provider declaring `provides` declares
 * `supports` too, so a declared migration source against a missing range is a
 * mismatch rather than a verified match.
 */
export function checkProviderMatch(input: ProviderMatchInput): Result<ProviderMatch> {
  const plugin = input.sourceRecord?.plugins[input.codingAgent];
  if (plugin?.provides === undefined) {
    return { ok: true, value: PROVIDER_MATCH.UNDECLARED };
  }
  if (plugin.provides !== input.version) {
    return { ok: false, error: formatProvidesMismatchError(input.version, plugin.provides, input.codingAgent) };
  }
  if (input.migratingFrom !== undefined) {
    if (plugin.supports === undefined) {
      return { ok: false, error: formatSupportsUndeclaredError(input.migratingFrom, input.codingAgent) };
    }
    const satisfied = satisfiesMethodologyRange(input.migratingFrom, plugin.supports);
    if (!satisfied.ok) return satisfied;
    if (!satisfied.value) {
      return {
        ok: false,
        error: formatSupportsMismatchError(input.migratingFrom, plugin.supports, input.codingAgent),
      };
    }
  }
  return { ok: true, value: PROVIDER_MATCH.VERIFIED };
}
