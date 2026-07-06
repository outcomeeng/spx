import { describe, it } from "vitest";

import {
  assertAppendPayloadChannelDoesNotReuseRunInput,
  assertAppendPayloadRequiredForEveryAppendVerb,
  assertAppendRejectsMalformedChangesetScopesBeforePayloadRead,
  assertAppendRejectsUnsupportedScopeTypesBeforePayloadRead,
} from "@testing/harnesses/verify/harness";

describe("verify append payload compliance", () => {
  it("requires --payload for every append verb", async () => {
    await assertAppendPayloadRequiredForEveryAppendVerb();
  });

  it("rejects unsupported scope types for every append verb before reading payloads", async () => {
    await assertAppendRejectsUnsupportedScopeTypesBeforePayloadRead();
  });

  it("rejects malformed changeset scopes for every append verb before reading payloads", async () => {
    await assertAppendRejectsMalformedChangesetScopesBeforePayloadRead();
  });

  it("records the --payload evidence without reusing the recorded run input as the append channel", async () => {
    await assertAppendPayloadChannelDoesNotReuseRunInput();
  });
});
