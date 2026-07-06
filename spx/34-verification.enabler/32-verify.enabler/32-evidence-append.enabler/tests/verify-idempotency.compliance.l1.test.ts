import { describe, it } from "vitest";

import {
  assertAppendIdempotencyKeyRequiredForEveryAppendVerb,
  assertAppendIdempotencyReturnsExistingSequenceForRepeatedKey,
  assertAppendRejectsUnsupportedVerificationTypesBeforePayloadRead,
  assertFindingEvidenceDeduplicatesByIdempotencyKey,
  assertIdempotencyKeysDoNotCollideAcrossAppendKinds,
} from "@testing/harnesses/verify/harness";

describe("verify append idempotency compliance", () => {
  it("rejects unsupported verification types before reading payloads for every append verb", async () => {
    await assertAppendRejectsUnsupportedVerificationTypesBeforePayloadRead();
  });

  it("requires --idempotency-key for every append verb", async () => {
    await assertAppendIdempotencyKeyRequiredForEveryAppendVerb();
  });

  it("returns the existing sequence for a repeated key and appends a fresh event only for a new key", async () => {
    await assertAppendIdempotencyReturnsExistingSequenceForRepeatedKey();
  });

  it("deduplicates repeated finding evidence by idempotency key", async () => {
    await assertFindingEvidenceDeduplicatesByIdempotencyKey();
  });

  it("does not deduplicate across append kinds that reuse one idempotency key", async () => {
    await assertIdempotencyKeysDoNotCollideAcrossAppendKinds();
  });
});
