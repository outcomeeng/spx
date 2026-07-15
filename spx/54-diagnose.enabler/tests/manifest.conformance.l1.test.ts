import { describe, it } from "vitest";

import {
  assertCompleteManifestRoundTrips,
  assertInvalidManifestRootsRejected,
  assertRequiredManifestFactsRejected,
  assertUnavailableManifestCheckRejected,
  assertUnknownManifestFieldsRejected,
  assertUnknownManifestCheckRejected,
  assertUnselectedMethodologyFactsIgnored,
} from "@testing/harnesses/diagnose/manifest";

describe("a manifest parses to the complete typed diagnostic contract", () => {
  it("round-trips every fact required by the selected checks", assertCompleteManifestRoundTrips);
});

describe("a manifest rejects incomplete or unsupported diagnostic facts", () => {
  it("rejects every selected check with absent or malformed required facts", assertRequiredManifestFactsRejected);
  it(
    "ignores malformed methodology facts when methodology-context is unselected",
    assertUnselectedMethodologyFactsIgnored,
  );
  it("rejects an unknown check name", assertUnknownManifestCheckRejected);
  it("rejects unknown and retired manifest fields", assertUnknownManifestFieldsRejected);
  it("rejects a known check unavailable in the current build", assertUnavailableManifestCheckRejected);
  it("rejects empty, absent, non-object, and malformed roots", assertInvalidManifestRootsRejected);
});
