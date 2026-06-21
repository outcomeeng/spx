/**
 * The spx-reachability diagnose check — classifies the `spx` CLI against the
 * manifest's version floor from its PATH resolution and reported version. The
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
}

function parseSemver(value: string): SemverParts | null {
  const match = /^\s*(\d{1,9})\.(\d{1,9})\.(\d{1,9})/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * Whether `version` is at or above `floor`. Returns null when either string is
 * not semver-shaped, so the check can fall back to an unknown verdict rather
 * than guess.
 */
export function meetsFloor(version: string, floor: string): boolean | null {
  const left = parseSemver(version);
  const right = parseSemver(floor);
  if (left === null || right === null) return null;
  if (left.major !== right.major) return left.major > right.major;
  if (left.minor !== right.minor) return left.minor > right.minor;
  return left.patch >= right.patch;
}

const REMEDIATION: Readonly<Record<SpxReachabilityVerdict, string>> = {
  [SPX_REACHABILITY_VERDICT.REACHABLE]: "spx is on PATH at or above the required floor; no action needed.",
  [SPX_REACHABILITY_VERDICT.BELOW_FLOOR]: "Update spx to at least the required floor (pnpm add -g @outcomeeng/spx).",
  [SPX_REACHABILITY_VERDICT.UNREACHABLE]: "Install spx and ensure it resolves on PATH (pnpm add -g @outcomeeng/spx).",
  [SPX_REACHABILITY_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, verify the manifest carries a valid spx_floor, that spx is on PATH, and that spx --version reports a semver version.",
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

/** Classifies the spx-reachability reading against the manifest floor into a check record. */
export function classifySpxReachability(reading: SpxReachabilityReading, floor: string | undefined): CheckRecord {
  if (reading.errored || floor === undefined) {
    return record(SPX_REACHABILITY_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading, floor);
  }
  if (reading.resolvedPath === null) {
    return record(SPX_REACHABILITY_VERDICT.UNREACHABLE, VERDICT_BUCKET.BROKEN, reading, floor);
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
