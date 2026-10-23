/**
 * The load gate: a window of load samples admits a command only when it is long enough, evenly
 * spaced, quiet against the logical CPU count, and not rising.
 *
 * @module lib/host-command-lock/load-gate
 */
import { LOAD_WINDOW } from "./constants";

export interface LoadSample {
  readonly atMs: number;
  readonly one: number;
  readonly five: number;
  readonly fifteen: number;
}

export function sampleIsValid(sample: LoadSample): boolean {
  return [sample.atMs, sample.one, sample.five, sample.fifteen].every(Number.isFinite);
}

/** A sample that alone breaks a limit, so the window it would join is discarded. */
export function sampleExceedsLimit(sample: LoadSample, cpuCount: number): boolean {
  return sample.one > LOAD_WINDOW.ONE_MINUTE_FACTOR * cpuCount
    || sample.five > LOAD_WINDOW.FIVE_MINUTE_FACTOR * cpuCount;
}

/** The least-squares slope of the one-minute loads, scaled over the window's span. */
export function fittedRise(samples: readonly LoadSample[]): number {
  const count = samples.length;
  const meanTime = samples.reduce((sum, sample) => sum + sample.atMs, 0) / count;
  const meanLoad = samples.reduce((sum, sample) => sum + sample.one, 0) / count;
  const covariance = samples.reduce((sum, sample) => sum + (sample.atMs - meanTime) * (sample.one - meanLoad), 0);
  const variance = samples.reduce((sum, sample) => sum + (sample.atMs - meanTime) ** 2, 0);
  const slope = variance === 0 ? 0 : covariance / variance;
  return slope * windowSpanMs(samples);
}

export function windowSpanMs(samples: readonly LoadSample[]): number {
  return samples[samples.length - 1].atMs - samples[0].atMs;
}

export function windowHasEnoughSamples(samples: readonly LoadSample[]): boolean {
  return samples.length >= LOAD_WINDOW.MIN_SAMPLES && windowSpanMs(samples) >= LOAD_WINDOW.MIN_SPAN_MS;
}

export function gapExceedsLimit(previous: LoadSample, next: LoadSample): boolean {
  return next.atMs - previous.atMs > LOAD_WINDOW.MAX_GAP_MS;
}

/** Whether a window admits the command. */
export function windowAdmits(samples: readonly LoadSample[], cpuCount: number): boolean {
  if (samples.length === 0 || !samples.every(sampleIsValid)) return false;
  return windowHasEnoughSamples(samples)
    && samples.every((sample, index) => index === 0 || !gapExceedsLimit(samples[index - 1], sample))
    && samples.every((sample) => !sampleExceedsLimit(sample, cpuCount))
    && fittedRise(samples) <= LOAD_WINDOW.RISE_FACTOR * cpuCount;
}
