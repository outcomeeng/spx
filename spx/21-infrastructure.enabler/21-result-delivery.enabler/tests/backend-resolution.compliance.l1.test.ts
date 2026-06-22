import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { deliverResult, type DeliveryBackendKind, resolveDeliveryBackend } from "@/lib/result-delivery";
import {
  arbitraryDeliveryBody,
  arbitraryDeliveryMarker,
  arbitraryDeliveryScope,
  arbitraryResolvableDeliveryEnvironment,
} from "@testing/generators/result-delivery";
import { RecordingDeliveryBackend } from "@testing/harnesses/result-delivery";

describe("a delivery resolves the backend from the environment and routes through the injected backend", () => {
  it("asks the resolver for the env-resolved kind and routes the body to that backend", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResolvableDeliveryEnvironment(),
        arbitraryDeliveryScope(),
        arbitraryDeliveryMarker(),
        arbitraryDeliveryBody(),
        async (env, scope, marker, body) => {
          const expected = resolveDeliveryBackend(env);
          if (!expected.ok) throw new Error(expected.error);

          const backend = new RecordingDeliveryBackend();
          const requestedKinds: DeliveryBackendKind[] = [];

          const result = await deliverResult({ scope, marker, body }, env, (kind) => {
            requestedKinds.push(kind);
            return backend;
          });

          expect(result.ok).toBe(true);
          // resolution comes from the environment, not a caller-named backend
          expect(requestedKinds).toEqual([expected.value]);
          // and the body routes through whichever backend that kind injected
          expect(backend.requests).toEqual([{ scope, marker, body }]);
        },
      ),
    );
  });

  it("delivers nothing when the resolved backend has no injected implementation", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResolvableDeliveryEnvironment(),
        arbitraryDeliveryScope(),
        arbitraryDeliveryMarker(),
        arbitraryDeliveryBody(),
        async (env, scope, marker, body) => {
          const result = await deliverResult({ scope, marker, body }, env, () => undefined);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            const resolved = resolveDeliveryBackend(env);
            if (resolved.ok) expect(result.error).toContain(resolved.value);
          }
        },
      ),
    );
  });
});
