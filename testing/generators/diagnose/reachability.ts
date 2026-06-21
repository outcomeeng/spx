/**
 * Generators for spx-reachability check inputs — floor components with a
 * non-zero patch (so a strictly-below version exists) and a reading builder that
 * defaults to an absent resolution the case overrides.
 *
 * @module testing/generators/diagnose/reachability
 */

import fc from "fast-check";

import type { SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";

/** Floor components `[major, minor, patch]` with patch ≥ 1, so a strictly-below version is constructible. */
export const arbitraryFloorParts = (): fc.Arbitrary<readonly [number, number, number]> =>
  fc.tuple(fc.nat(99), fc.nat(99), fc.integer({ min: 1, max: 99 }));

/** Builds a reading from overrides over an absent, non-errored default. */
export function spxReachabilityReading(overrides: Partial<SpxReachabilityReading>): SpxReachabilityReading {
  return { resolvedPath: null, version: null, errored: false, ...overrides };
}
