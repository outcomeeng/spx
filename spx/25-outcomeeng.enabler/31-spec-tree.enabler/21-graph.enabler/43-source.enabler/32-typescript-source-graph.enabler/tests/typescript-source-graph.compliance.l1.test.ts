import { describe, it } from "vitest";

import {
  assertTypescriptFactsCarryRegisteredKindAndProvenance,
  assertTypescriptFactsDeriveOnlyFromSuppliedPayload,
  assertTypescriptProvidersRegistered,
} from "@testing/harnesses/outcomeeng/typescript-source-graph";

describe("typescript source graph provider compliance", () => {
  it("reaches both typescript descriptors through the provider registry's explicit imports", () => {
    assertTypescriptProvidersRegistered();
  });

  it("emits only facts carrying a registered kind and provenance naming typescript and the emitting tool", () => {
    assertTypescriptFactsCarryRegisteredKindAndProvenance();
  });

  it("derives facts deterministically and only from data present in the supplied payload", () => {
    assertTypescriptFactsDeriveOnlyFromSuppliedPayload();
  });
});
