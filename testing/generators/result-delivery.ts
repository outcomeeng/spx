import fc from "fast-check";

import { DELIVERY_BACKEND_ORDER, type DeliveryEnvironment, isDeliveryBackendKind } from "@/lib/result-delivery";

/** A safe scope token per the state module's token rule: `^[A-Za-z0-9_-]+$`, bounded. */
const SCOPE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** An over-the-wire selector shape that may or may not name a registered backend. */
const SELECTOR_PATTERN = /^[a-z][a-z0-9-]{1,20}$/;

const RESULT_DELIVERY_SAMPLE_SEED = 0x7264656c;

/** A rendered body the consumer hands spx — opaque, any string including empty. */
export const arbitraryDeliveryBody = (): fc.Arbitrary<string> => fc.string();

/** A marker addressing one upsertable surface — opaque, non-empty. */
export const arbitraryDeliveryMarker = (): fc.Arbitrary<string> => fc.string({ minLength: 1 });

/** A result scope token the local backend composes a surface directory from. */
export const arbitraryDeliveryScope = (): fc.Arbitrary<string> => fc.stringMatching(SCOPE_TOKEN_PATTERN);

/** Two distinct markers, so each addresses its own surface under one scope. */
export const arbitraryDistinctDeliveryMarkers = (): fc.Arbitrary<readonly [string, string]> =>
  fc.tuple(arbitraryDeliveryMarker(), arbitraryDeliveryMarker()).filter(([first, second]) => first !== second);

/** Two distinct bodies, so a re-delivery's update to a surface is observable. */
export const arbitraryDistinctDeliveryBodies = (): fc.Arbitrary<readonly [string, string]> =>
  fc.tuple(arbitraryDeliveryBody(), arbitraryDeliveryBody()).filter(([first, second]) => first !== second);

/**
 * A backend environment snapshot that always resolves to a registered backend:
 * either no override (resolution falls to the CI/local rule) or an override drawn
 * from the registered set, so the snapshot never exercises the rejection branch.
 */
export const arbitraryResolvableDeliveryEnvironment = (): fc.Arbitrary<DeliveryEnvironment> =>
  fc.record({
    backendOverride: fc.option(fc.constantFrom(...DELIVERY_BACKEND_ORDER), { nil: undefined }),
    continuousIntegration: fc.boolean(),
    githubPullRequest: fc.boolean(),
  });

/** A selector value that names no registered backend, for the rejection branch. */
export const arbitraryUnregisteredBackendSelector = (): fc.Arbitrary<string> =>
  fc.stringMatching(SELECTOR_PATTERN).filter((value) => !isDeliveryBackendKind(value));

/** Draw one deterministic value from a result-delivery arbitrary for single-sample tests. */
export function sampleResultDeliveryValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: RESULT_DELIVERY_SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("result-delivery test generator returned no sample");
  return value;
}
