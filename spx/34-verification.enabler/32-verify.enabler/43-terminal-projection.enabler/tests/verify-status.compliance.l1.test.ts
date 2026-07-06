import { describe, it } from "vitest";

import {
  assertFinishStatusAndRenderProjectTerminalMetadata,
  assertFinishStatusAndRenderShareFindingProjection,
  assertStatusAndRenderHydrateWithMalformedRecordedInput,
  assertStatusAndRenderHydrateWithoutRecordedInput,
  assertStatusAndRenderRejectMismatchedTerminalRecordedInput,
  assertStatusAndRenderRejectRawUnterminalRun,
  assertStatusAndRenderRejectRequestedScopeMismatch,
  assertStatusAndRenderRejectUnsupportedVerificationType,
  assertStatusFinishedRunProjection,
  assertStatusStartedRunProjection,
} from "@testing/harnesses/verify/harness";

describe("verify status compliance", () => {
  it("reports run token, verification type, scope type, unsealed state, last sequence, and next legal actions for a started run", async () => {
    await assertStatusStartedRunProjection();
  });

  it("reports sealed state, terminal status, and no remaining lifecycle actions after finish", async () => {
    await assertStatusFinishedRunProjection();
  });

  it("reports the same authoritative finding count and run token across finish, status, and render for a sealed review run", async () => {
    await assertFinishStatusAndRenderShareFindingProjection();
  });

  it("projects terminal metadata across finish, status, and render for a sealed review run", async () => {
    await assertFinishStatusAndRenderProjectTerminalMetadata();
  });

  it("projects status and render from the journal when a hydrated run has no recorded input file", async () => {
    await assertStatusAndRenderHydrateWithoutRecordedInput();
  });

  it("projects status and render from the journal when a terminal run has a malformed recorded input file", async () => {
    await assertStatusAndRenderHydrateWithMalformedRecordedInput();
  });

  it("rejects status and render when a terminal run has mismatched recorded-input selectors", async () => {
    await assertStatusAndRenderRejectMismatchedTerminalRecordedInput();
  });

  it("rejects status and render for an unterminal raw journal run without a recorded verification input", async () => {
    await assertStatusAndRenderRejectRawUnterminalRun();
  });

  it("rejects an unsupported verification type before resolving an existing run for status and render", async () => {
    await assertStatusAndRenderRejectUnsupportedVerificationType();
  });

  it("rejects status and render when the requested scope differs from the recorded run scope", async () => {
    await assertStatusAndRenderRejectRequestedScopeMismatch();
  });
});
