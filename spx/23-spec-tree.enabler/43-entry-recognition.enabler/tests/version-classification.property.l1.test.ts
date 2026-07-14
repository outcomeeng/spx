import { describe, it } from "vitest";

import {
  assertCanonicalVersionNameMapsToValidEntry,
  assertPriorVersionNameMapsToSupersededEntry,
  assertUnknownVersionNameMapsToInvalidEntry,
} from "@testing/harnesses/spec-tree/naming-schema-version";

describe("version classification", () => {
  it("maps a name matching the canonical version to a valid entry of its kind", () => {
    assertCanonicalVersionNameMapsToValidEntry();
  });

  it("maps a name matching a prior version to a superseded entry naming the matched version", () => {
    assertPriorVersionNameMapsToSupersededEntry();
  });

  it("maps a name matching no version to an invalid entry", () => {
    assertUnknownVersionNameMapsToInvalidEntry();
  });
});
