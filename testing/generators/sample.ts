/**
 * The single-draw sampler every generator module shares.
 *
 * Scenario and compliance tests need one concrete value rather than a swept domain, but the value
 * still belongs to the generator that owns the input domain. Drawing through a pinned seed keeps
 * such a test deterministic — the same case every run, reproducible from a failure report — while
 * keeping the value out of the assertion file.
 */
import * as fc from "fast-check";

/** Pinned so a single-draw case is the same on every run and a failure reproduces. */
const SAMPLE_SEED = 20_260_724;

export function sampleGeneratedValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed: SAMPLE_SEED });
  if (value === undefined) {
    throw new Error("Generator returned no sample");
  }
  return value;
}
