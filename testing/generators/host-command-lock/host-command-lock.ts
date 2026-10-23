/**
 * Generators for the host command lock.
 *
 * Load series and CPU counts draw from the open numeric domain the load gate judges; the factors
 * that bound a series come from the production `LOAD_WINDOW`, so a change to a limit is an
 * intentional behavior change the cases follow. The oracle that decides admission lives in the
 * linked property test, never in a generator.
 */
import * as fc from "fast-check";

import { LOAD_WINDOW, type LoadSample, SUPPORTED_PLATFORM } from "@/lib/host-command-lock";

const MIN_CPU_COUNT = 1;
const MAX_CPU_COUNT = 64;
const MIN_SERIES_LENGTH = 2;
const MAX_SERIES_LENGTH = 14;
const MAX_LOAD_PER_CPU = 1.6;
const MAX_STEP_FACTOR = 1.6;
const PATH_SEGMENT = /^[a-z]{2,8}$/;
const MS_PER_SECOND = 1_000;
const INVALID_SAMPLE_PROBABILITY_WEIGHT = 1;
const VALID_SAMPLE_PROBABILITY_WEIGHT = 12;

export function arbitraryCpuCount(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_CPU_COUNT, max: MAX_CPU_COUNT });
}

/** One sample whose loads scale with the CPU count; an occasional sample is invalid (not finite). */
function arbitrarySample(cpuCount: number, atMs: number): fc.Arbitrary<LoadSample> {
  const load = fc.double({ min: 0, max: MAX_LOAD_PER_CPU * cpuCount, noNaN: true });
  const valid = fc.record({ atMs: fc.constant(atMs), one: load, five: load, fifteen: load });
  const invalid = fc.record({
    atMs: fc.constant(atMs),
    one: fc.constant(Number.NaN),
    five: load,
    fifteen: load,
  });
  return fc.oneof(
    { weight: VALID_SAMPLE_PROBABILITY_WEIGHT, arbitrary: valid },
    { weight: INVALID_SAMPLE_PROBABILITY_WEIGHT, arbitrary: invalid },
  );
}

/** A series of timestamped samples whose gaps straddle the production gap limit and sample interval. */
export function arbitraryLoadSeries(cpuCount: number): fc.Arbitrary<LoadSample[]> {
  const gapMs = fc.integer({
    min: LOAD_WINDOW.SAMPLE_INTERVAL_MS,
    max: Math.round(LOAD_WINDOW.MAX_GAP_MS * MAX_STEP_FACTOR),
  });
  return fc
    .array(gapMs, { minLength: MIN_SERIES_LENGTH, maxLength: MAX_SERIES_LENGTH })
    .chain((gaps) => {
      const times = gaps.reduce<number[]>((acc, gap) => [...acc, acc[acc.length - 1] + gap], [0]);
      return fc.tuple(...times.map((atMs) => arbitrarySample(cpuCount, atMs)));
    });
}

/** A series that is long enough, evenly spaced, and quiet: the shape of an admitted window. */
export function arbitraryQuietWindow(cpuCount: number): fc.Arbitrary<LoadSample[]> {
  const count = LOAD_WINDOW.MIN_SAMPLES + 1;
  const quiet = fc.double({ min: 0, max: LOAD_WINDOW.ONE_MINUTE_FACTOR * cpuCount * 0.5, noNaN: true });
  return fc.tuple(...Array.from({ length: count }, () => quiet)).map((loads) =>
    loads.map((load, index) => ({
      atMs: index * LOAD_WINDOW.SAMPLE_INTERVAL_MS,
      one: load,
      five: load,
      fifteen: load,
    }))
  );
}

/** Seconds a wait cap may take in cap-expiry cases. */
export function arbitraryWaitSeconds(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 600 });
}

export function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT);
}

/** `count` pairwise different labels, such as the names of concurrent guarded runs. */
export function arbitraryDistinctLabels(count: number): fc.Arbitrary<string[]> {
  return fc.uniqueArray(arbitraryPathSegment(), { minLength: count, maxLength: count });
}

/** The index of a sample in a scripted series that a window can lose and regain: after the first, before the last two. */
export function arbitraryBadSampleIndex(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: LOAD_WINDOW.MIN_SAMPLES - 2 });
}

/** Absolute directory paths used as environment values for the lock-path mapping. */
export function arbitraryAbsoluteDirectory(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 }).map((parts) => `/${parts.join("/")}`);
}

/** Relative directory paths: never starting with a slash. */
export function arbitraryRelativeDirectory(): fc.Arbitrary<string> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"));
}

const PLATFORM_NAMES = ["darwin", "linux", "win32"] as const;
const ARCHITECTURE_NAMES = ["arm64", "x64"] as const;

/** Every operating-system and architecture pair except the one supported platform. */
export const UNSUPPORTED_PLATFORMS: ReadonlyArray<{ readonly os: string; readonly arch: string }> = PLATFORM_NAMES
  .flatMap((os) => ARCHITECTURE_NAMES.map((arch) => ({ os, arch })))
  .filter((platform) => platform.os !== SUPPORTED_PLATFORM.os || platform.arch !== SUPPORTED_PLATFORM.arch);

const LOUD_MARGIN = 0.5;

/** A sample at zero load: every limit holds. */
export function quietSample(): Omit<LoadSample, "atMs"> {
  return { one: 0, five: 0, fifteen: 0 };
}

/** A sample whose one-minute load exceeds the one-minute limit for the CPU count. */
export function loudSample(cpuCount: number): Omit<LoadSample, "atMs"> {
  const load = cpuCount * (LOAD_WINDOW.ONE_MINUTE_FACTOR + LOUD_MARGIN);
  return { one: load, five: 0, fifteen: 0 };
}

/** A sample that is not a finite measurement. */
export function invalidSample(): Omit<LoadSample, "atMs"> {
  return { one: Number.NaN, five: 0, fifteen: 0 };
}

/** The slot-wait ceiling that falls inside the minimum window span, in seconds. */
export function capInsideWindowSeconds(): number {
  return LOAD_WINDOW.MIN_SPAN_MS / MS_PER_SECOND - 1;
}

/** The wait cap that expires exactly when the minimum window span completes, in seconds. */
export function capAtWindowEndSeconds(): number {
  return LOAD_WINDOW.MIN_SPAN_MS / MS_PER_SECOND;
}

/** A stall longer than the largest tolerated gap between samples. */
export function overGapStallMs(): number {
  return LOAD_WINDOW.MAX_GAP_MS + MS_PER_SECOND;
}

export function secondsToMs(seconds: number): number {
  return seconds * MS_PER_SECOND;
}
