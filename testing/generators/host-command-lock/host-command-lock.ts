/**
 * Generators for the host command lock.
 *
 * CPU counts and load samples draw from the domain the load gate judges; the factors that bound a
 * sample come from the production `LOAD_WINDOW`, so a change to a limit is an intentional behavior
 * change the cases follow. The oracle that decides admission lives in the linked tests, never in a
 * generator.
 */
import { join } from "node:path";

import * as fc from "fast-check";

import { LOAD_WINDOW, type LoadSample, LOCK_FILE_SEGMENTS, SUPPORTED_PLATFORM } from "@/lib/host-command-lock";

const MIN_CPU_COUNT = 1;
const MAX_CPU_COUNT = 64;
const PATH_SEGMENT = /^[a-z]{2,8}$/;
const MS_PER_SECOND = 1_000;

export function arbitraryCpuCount(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_CPU_COUNT, max: MAX_CPU_COUNT });
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

const FIVE_MINUTE_MARGIN = 0.5;
const RISE_STEP_FACTOR = 0.1;
const MIN_PROCESS_ID = 1_000;
const MAX_PROCESS_ID = 99_999;
const HOST_PROCESS_COUNT = 9;
const MIN_DESCRIPTOR_NUMBER = 10;
const MAX_DESCRIPTOR_NUMBER = 200;
const MIN_DEVICE_NUMBER = 1;
const MAX_DEVICE_NUMBER = 1_048_576;
const MIN_INODE_NUMBER = 1;
const MAX_INODE_NUMBER = 1_073_741_824;
const MIN_EPOCH_MS = 1_500_000_000_000;
const MAX_EPOCH_MS = 1_900_000_000_000;
const MAX_COMMAND_WORDS = 3;
const RETRY_JITTER_LIMIT_MS = 500;

/** The identities one in-memory host reports: lock file, inodes, process ids, descriptor numbers, and instants. */
export interface HostIdentity {
  readonly lockPath: string;
  readonly fileId: string;
  readonly otherFileId: string;
  readonly supervisorPid: number;
  readonly childPids: readonly number[];
  readonly firstDescriptor: number;
  readonly workingDirectory: string;
  readonly generatedRunId: string;
  readonly startedAtMs: number;
}

function arbitraryFileId(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: MIN_DEVICE_NUMBER, max: MAX_DEVICE_NUMBER }),
      fc.integer({ min: MIN_INODE_NUMBER, max: MAX_INODE_NUMBER }),
    )
    .map(([device, inode]) => `${device}:${inode}`);
}

export function arbitraryHostIdentity(): fc.Arbitrary<HostIdentity> {
  return fc
    .record({
      lockDirectory: arbitraryAbsoluteDirectory(),
      fileIds: fc.uniqueArray(arbitraryFileId(), { minLength: 2, maxLength: 2 }),
      processIds: fc.uniqueArray(fc.integer({ min: MIN_PROCESS_ID, max: MAX_PROCESS_ID }), {
        minLength: HOST_PROCESS_COUNT,
        maxLength: HOST_PROCESS_COUNT,
      }),
      firstDescriptor: fc.integer({ min: MIN_DESCRIPTOR_NUMBER, max: MAX_DESCRIPTOR_NUMBER }),
      workingDirectory: arbitraryAbsoluteDirectory(),
      generatedRunId: arbitraryPathSegment(),
      startedAtMs: fc.integer({ min: MIN_EPOCH_MS, max: MAX_EPOCH_MS }),
    })
    .map((drawn) => ({
      lockPath: join(drawn.lockDirectory, ...LOCK_FILE_SEGMENTS),
      fileId: drawn.fileIds[0],
      otherFileId: drawn.fileIds[1],
      supervisorPid: drawn.processIds[0],
      childPids: drawn.processIds.slice(1),
      firstDescriptor: drawn.firstDescriptor,
      workingDirectory: drawn.workingDirectory,
      generatedRunId: drawn.generatedRunId,
      startedAtMs: drawn.startedAtMs,
    }));
}

/** A command and its arguments. */
export function arbitraryCommand(): fc.Arbitrary<readonly string[]> {
  return fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: MAX_COMMAND_WORDS });
}

/** `count` pairwise different randomized delays, each below the jitter bound of a busy retry. */
export function arbitraryRetryJitters(count: number): fc.Arbitrary<number[]> {
  return fc.uniqueArray(fc.integer({ min: 0, max: RETRY_JITTER_LIMIT_MS - 1 }), {
    minLength: count,
    maxLength: count,
  });
}

/** A sample whose five-minute load exceeds the five-minute limit for the CPU count. */
export function loudFiveMinuteSample(cpuCount: number): Omit<LoadSample, "atMs"> {
  const load = cpuCount * (LOAD_WINDOW.FIVE_MINUTE_FACTOR + FIVE_MINUTE_MARGIN);
  return { one: 0, five: load, fifteen: 0 };
}

/**
 * Samples whose one-minute load climbs by a tenth of the CPU count per sample across a full window,
 * without any sample breaking a limit, then stays flat at its last value.
 */
export function risingThenFlatSamples(cpuCount: number): Array<Omit<LoadSample, "atMs">> {
  return Array.from({ length: LOAD_WINDOW.MIN_SAMPLES }, (_, step) => ({
    one: step * RISE_STEP_FACTOR * cpuCount,
    five: 0,
    fifteen: 0,
  }));
}

/** The exit code of a child that completes cleanly. */
export const CLEAN_EXIT_CODE = 0;

/** Busy retries a waiting run makes before the holder's child exits in the contention cases. */
export const BUSY_RETRY_COUNT = 3;

/** Event-loop turns the host lets pass so a scripted supervisor reaches its death point. */
export const SUPERVISOR_SETTLE_TURNS = 50;
