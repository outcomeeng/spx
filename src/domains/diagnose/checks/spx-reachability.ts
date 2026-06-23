/**
 * The spx-reachability diagnose check — classifies the `spx` CLI against the
 * resolved version floor from its PATH resolution and reported version. The
 * classification is pure over the gathered reading and the floor; the reading
 * is obtained through a dependency-injected probe so the check verifies over
 * controlled readings without resolving a real PATH.
 *
 * @module domains/diagnose/checks/spx-reachability
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The spx-reachability verdict labels. */
export const SPX_REACHABILITY_VERDICT = {
  REACHABLE: "reachable",
  PRESENT: "present",
  BELOW_FLOOR: "below-floor",
  UNREACHABLE: "unreachable",
  UNKNOWN: "unknown",
} as const;

export type SpxReachabilityVerdict = (typeof SPX_REACHABILITY_VERDICT)[keyof typeof SPX_REACHABILITY_VERDICT];

/** The reading the probe gathers: the resolved path and version, or an error flag. */
export interface SpxReachabilityReading {
  /** The `spx` path resolved on PATH, or null when `spx` is absent from PATH. */
  readonly resolvedPath: string | null;
  /** The reported `spx` version, or null when it could not be read. */
  readonly version: string | null;
  /** True when the probe itself errored, yielding an unknown verdict. */
  readonly errored: boolean;
}

/** The injected boundary that gathers the spx-reachability reading. */
export interface SpxReachabilityProbe {
  probe(): Promise<SpxReachabilityReading>;
}

interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The prerelease tag without its leading hyphen (e.g. `beta.1`), or null for a release version. */
  readonly prerelease: string | null;
}

function parseSemver(value: string): SemverParts | null {
  const match = /^\s*(\d{1,9})\.(\d{1,9})\.(\d{1,9})(-[0-9A-Za-z.-]{1,64})?/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? null : match[4].slice(1),
  };
}

function isNumericIdentifier(identifier: string): boolean {
  return /^\d{1,18}$/.test(identifier);
}

/** Compares two prerelease identifiers by semver §11: numeric identifiers rank below alphanumeric ones. */
function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = isNumericIdentifier(left);
  const rightNumeric = isNumericIdentifier(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Compares two prerelease tags by semver §11; a larger set of identifiers outranks a smaller equal prefix. */
function comparePrerelease(left: string, right: string): number {
  const leftIds = left.split(".");
  const rightIds = right.split(".");
  const shared = Math.min(leftIds.length, rightIds.length);
  for (let index = 0; index < shared; index += 1) {
    const comparison = comparePrereleaseIdentifier(leftIds[index], rightIds[index]);
    if (comparison !== 0) return comparison;
  }
  return leftIds.length - rightIds.length;
}

/**
 * Whether `version` is at or above `floor` by semver precedence. At equal
 * major.minor.patch a prerelease ranks below a release, and two prereleases
 * compare by their dot-separated identifiers (semver §11), so a prerelease below
 * the floor does not satisfy it. Returns null when either string is not
 * semver-shaped, so the check falls back to an unknown verdict rather than guess.
 */
export function meetsFloor(version: string, floor: string): boolean | null {
  const left = parseSemver(version);
  const right = parseSemver(floor);
  if (left === null || right === null) return null;
  if (left.major !== right.major) return left.major > right.major;
  if (left.minor !== right.minor) return left.minor > right.minor;
  if (left.patch !== right.patch) return left.patch > right.patch;
  if (left.prerelease === null) return true;
  if (right.prerelease === null) return false;
  return comparePrerelease(left.prerelease, right.prerelease) >= 0;
}

const REMEDIATION: Readonly<Record<SpxReachabilityVerdict, string>> = {
  [SPX_REACHABILITY_VERDICT.REACHABLE]: "spx is on PATH at or above the required floor; no action needed.",
  [SPX_REACHABILITY_VERDICT.PRESENT]:
    "spx is on PATH; no version floor is configured to compare against, so only presence is reported.",
  [SPX_REACHABILITY_VERDICT.BELOW_FLOOR]: "Update spx to at least the required floor (pnpm add -g @outcomeeng/spx).",
  [SPX_REACHABILITY_VERDICT.UNREACHABLE]: "Install spx and ensure it resolves on PATH (pnpm add -g @outcomeeng/spx).",
  [SPX_REACHABILITY_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, verify the configured or manifest-supplied spx_floor is a valid semver, that spx is on PATH, and that spx --version reports a semver version.",
};

function record(
  verdict: SpxReachabilityVerdict,
  bucket: CheckRecord["bucket"],
  reading: SpxReachabilityReading,
  floor: string | undefined,
): CheckRecord {
  return {
    name: CHECK_NAME.SPX_REACHABILITY,
    verdict,
    bucket,
    readings: {
      path: reading.resolvedPath ?? "(not on PATH)",
      version: reading.version ?? "(unread)",
      floor: floor ?? "(absent)",
    },
    remediation: REMEDIATION[verdict],
  };
}

/**
 * Classifies the spx-reachability reading against the resolved floor into a
 * check record. Presence is judged before the floor: an absent `spx` is broken
 * regardless of the floor, and a present `spx` with no floor configured reports
 * its presence and version rather than an unknown verdict.
 */
export function classifySpxReachability(reading: SpxReachabilityReading, floor: string | undefined): CheckRecord {
  if (reading.errored) {
    return record(SPX_REACHABILITY_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading, floor);
  }
  if (reading.resolvedPath === null) {
    return record(SPX_REACHABILITY_VERDICT.UNREACHABLE, VERDICT_BUCKET.BROKEN, reading, floor);
  }
  if (floor === undefined) {
    return record(SPX_REACHABILITY_VERDICT.PRESENT, VERDICT_BUCKET.HEALTHY, reading, floor);
  }
  if (reading.version === null) {
    return record(SPX_REACHABILITY_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading, floor);
  }
  const atOrAbove = meetsFloor(reading.version, floor);
  if (atOrAbove === null) {
    return record(SPX_REACHABILITY_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading, floor);
  }
  return atOrAbove
    ? record(SPX_REACHABILITY_VERDICT.REACHABLE, VERDICT_BUCKET.HEALTHY, reading, floor)
    : record(SPX_REACHABILITY_VERDICT.BELOW_FLOOR, VERDICT_BUCKET.DEGRADED, reading, floor);
}

/** Builds the spx-reachability check runner over an injected probe. */
export function spxReachabilityRunner(probe: SpxReachabilityProbe): CheckRunner {
  return async (manifest) => classifySpxReachability(await probe.probe(), manifest.spxFloor);
}
