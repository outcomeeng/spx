import { describe, it } from "vitest";

import {
  assertShowDefaultAndJsonFormatsAreEquivalent,
  assertShowEmitsDefaultConfig,
  assertShowEmitsJsonConfig,
  assertShowReflectsConfigOverrides,
  assertShowSurfacesResolutionFailure,
} from "@testing/harnesses/config/cli";

describe("showCommand", () => {
  it("emits a default-format dump of the resolved Config when no overrides apply", async () => {
    await assertShowEmitsDefaultConfig();
  });

  it("reflects config-driven overrides in the emitted default format", async () => {
    await assertShowReflectsConfigOverrides();
  });

  it("emits a JSON document when --json is set", async () => {
    await assertShowEmitsJsonConfig();
  });

  it("emits equivalent JSON and default-format encodings", async () => {
    await assertShowDefaultAndJsonFormatsAreEquivalent();
  });

  it("surfaces a resolveConfig error with a descriptor-qualified diagnostic", async () => {
    await assertShowSurfacesResolutionFailure();
  });
});
