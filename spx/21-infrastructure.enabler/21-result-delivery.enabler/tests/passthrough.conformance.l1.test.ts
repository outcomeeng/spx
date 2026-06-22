import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { deliverResult, DELIVERY_BACKEND } from "@/lib/result-delivery";
import {
  arbitraryDeliveryBody,
  arbitraryDeliveryMarker,
  arbitraryDeliveryScope,
  arbitraryResolvableDeliveryEnvironment,
} from "@testing/generators/result-delivery";
import { RecordingDeliveryBackend } from "@testing/harnesses/result-delivery";

describe("result delivery hands the backend the body the consumer rendered, adding only addressing", () => {
  it("delivers the rendered body unchanged, transforming nothing", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryResolvableDeliveryEnvironment(),
        arbitraryDeliveryScope(),
        arbitraryDeliveryMarker(),
        arbitraryDeliveryBody(),
        async (env, scope, marker, body) => {
          const backend = new RecordingDeliveryBackend();

          const result = await deliverResult({ scope, marker, body }, env, () => backend);

          expect(result.ok).toBe(true);
          // the backend receives the rendered body byte-for-byte, with the scope and
          // marker carried alongside as the only addressing spx adds
          expect(backend.requests).toEqual([{ scope, marker, body }]);
          expect(backend.requests[0]?.body).toBe(body);
        },
      ),
    );
  });

  it("routes only the resolved backend and leaves every other registered backend untouched", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryDeliveryScope(),
        arbitraryDeliveryMarker(),
        arbitraryDeliveryBody(),
        async (scope, marker, body) => {
          const localBackend = new RecordingDeliveryBackend();
          const otherBackend = new RecordingDeliveryBackend();

          // a local environment resolves to the local backend, so only it is routed
          await deliverResult(
            { scope, marker, body },
            { continuousIntegration: false, githubPullRequest: false },
            (kind) => kind === DELIVERY_BACKEND.LOCAL ? localBackend : otherBackend,
          );

          expect(localBackend.requests).toHaveLength(1);
          expect(otherBackend.requests).toEqual([]);
        },
      ),
    );
  });
});
