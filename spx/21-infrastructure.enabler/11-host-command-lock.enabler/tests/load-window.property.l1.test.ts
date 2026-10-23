/**
 * Load window admission: a window admits exactly when the declared conditions hold, judged by an
 * independent least-squares fit and span computation over the generated series.
 */

import * as fc from "fast-check";
import { describe, it } from "vitest";

import { LOAD_WINDOW, type LoadSample, windowAdmits } from "@/lib/host-command-lock";
import {
  arbitraryCpuCount,
  arbitraryLoadSeries,
  arbitraryQuietWindow,
} from "@testing/generators/host-command-lock/host-command-lock";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

function fittedRise(samples: readonly LoadSample[]): number {
  const n = samples.length;
  const meanT = samples.reduce((sum, s) => sum + s.atMs, 0) / n;
  const meanY = samples.reduce((sum, s) => sum + s.one, 0) / n;
  const covariance = samples.reduce((sum, s) => sum + (s.atMs - meanT) * (s.one - meanY), 0);
  const variance = samples.reduce((sum, s) => sum + (s.atMs - meanT) ** 2, 0);
  const slope = variance === 0 ? 0 : covariance / variance;
  return slope * (samples[n - 1].atMs - samples[0].atMs);
}

describe("load window admission", () => {
  it("admits exactly when the declared conditions hold", () => {
    assertProperty(
      arbitraryCpuCount().chain((cpuCount) =>
        fc.tuple(fc.constant(cpuCount), fc.oneof(arbitraryLoadSeries(cpuCount), arbitraryQuietWindow(cpuCount)))
      ),
      ([cpuCount, samples]) => {
        const valid = samples.every((s) => [s.one, s.five, s.fifteen].every(Number.isFinite));
        const expected = valid
          && samples.length >= LOAD_WINDOW.MIN_SAMPLES
          && samples[samples.length - 1].atMs - samples[0].atMs >= LOAD_WINDOW.MIN_SPAN_MS
          && samples.every((s, i) => i === 0 || s.atMs - samples[i - 1].atMs <= LOAD_WINDOW.MAX_GAP_MS)
          && samples.every((s) => s.one <= LOAD_WINDOW.ONE_MINUTE_FACTOR * cpuCount)
          && samples.every((s) => s.five <= LOAD_WINDOW.FIVE_MINUTE_FACTOR * cpuCount)
          && fittedRise(samples) <= LOAD_WINDOW.RISE_FACTOR * cpuCount;

        return windowAdmits(samples, cpuCount) === expected;
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
