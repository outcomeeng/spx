import { describe, it } from "vitest";

import { assertManifestResolvesProductPluginIntent } from "@testing/harnesses/diagnose/cli";
import { registerDiagnoseCliScenarios } from "@testing/harnesses/diagnose/cli-scenarios";

registerDiagnoseCliScenarios();

describe("spx diagnose product plugin intent", () => {
  it("resolves product plugin intent alongside a supplied manifest", assertManifestResolvesProductPluginIntent);
});
