import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DELIVERY_BACKEND,
  DELIVERY_BACKEND_ORDER,
  type DeliveryBackendKind,
  type DeliveryEnvironment,
  resolveDeliveryBackend,
} from "@/lib/result-delivery";
import { arbitraryUnregisteredBackendSelector } from "@testing/generators/result-delivery";

describe("resolveDeliveryBackend maps the environment to the bound delivery backend", () => {
  it.each<{ readonly env: DeliveryEnvironment; readonly expected: DeliveryBackendKind }>([
    // an unset selector outside continuous integration binds the local backend
    { env: { continuousIntegration: false, githubPullRequest: false }, expected: DELIVERY_BACKEND.LOCAL },
    // a continuous-integration run that is not a GitHub pull request still binds local
    { env: { continuousIntegration: true, githubPullRequest: false }, expected: DELIVERY_BACKEND.LOCAL },
    // a GitHub pull request outside continuous integration binds local
    { env: { continuousIntegration: false, githubPullRequest: true }, expected: DELIVERY_BACKEND.LOCAL },
    // a hosted continuous-integration GitHub pull request binds that hosted backend
    { env: { continuousIntegration: true, githubPullRequest: true }, expected: DELIVERY_BACKEND.GITHUB_PR },
    // the local selector binds the local backend even under a hosted environment
    {
      env: { backendOverride: DELIVERY_BACKEND.LOCAL, continuousIntegration: true, githubPullRequest: true },
      expected: DELIVERY_BACKEND.LOCAL,
    },
    // an explicit hosted selector binds that backend outside continuous integration
    {
      env: { backendOverride: DELIVERY_BACKEND.GITHUB_PR, continuousIntegration: false, githubPullRequest: false },
      expected: DELIVERY_BACKEND.GITHUB_PR,
    },
  ])("binds $expected", ({ env, expected }) => {
    const result = resolveDeliveryBackend(env);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it("rejects an unrecognized selector, naming the value and the registered backends", () => {
    fc.assert(
      fc.property(arbitraryUnregisteredBackendSelector(), (override) => {
        const result = resolveDeliveryBackend({
          backendOverride: override,
          continuousIntegration: false,
          githubPullRequest: false,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(override);
          for (const kind of DELIVERY_BACKEND_ORDER) {
            expect(result.error).toContain(kind);
          }
        }
      }),
    );
  });
});
