import { constants as osConstants } from "node:os";

import * as fc from "fast-check";

const UNKNOWN_SIGNAL_NAME_MAX_LENGTH = 64;
const NODE_SIGNAL_NAMES: ReadonlySet<string> = new Set(Object.keys(osConstants.signals));
const SPAWN_FIXTURE_TEXT_UNITS = "abcdefghijklmnopqrstuvwxyz".split("");
const SPAWN_FIXTURE_TEXT_MAX_LENGTH = 32;

/** Exit code -1, the code the spawn fixture reports when it can resolve no exit status. */
export const SPAWN_FIXTURE_EXPECTED_UNKNOWN_EXIT_CODE = -1;

/** A string of 1 to 64 characters that names no signal in Node's signal-number table. */
export function arbitraryUnknownSignalName(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: 1, maxLength: UNKNOWN_SIGNAL_NAME_MAX_LENGTH })
    .filter((signalName) => !NODE_SIGNAL_NAMES.has(signalName));
}

/** A text of 1 to 32 lowercase letters, which a child writes to a stream or names a file with. */
export function arbitrarySpawnFixtureText(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...SPAWN_FIXTURE_TEXT_UNITS),
    minLength: 1,
    maxLength: SPAWN_FIXTURE_TEXT_MAX_LENGTH,
  });
}

/** One text drawn from {@link arbitrarySpawnFixtureText}, for a scenario. */
export function sampleSpawnFixtureText(): string {
  const [text] = fc.sample(arbitrarySpawnFixtureText(), { numRuns: 1 });
  return text;
}
