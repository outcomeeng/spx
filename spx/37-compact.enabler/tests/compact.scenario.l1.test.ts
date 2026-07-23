import { describe, expect, it } from "vitest";

import {
  withCompactPathObservation,
  withEscapedTranscriptObservation,
  withMissingFoundationObservation,
  withNestedTranscriptObservation,
  withNonStringMarkerObservation,
  withUnescapedTranscriptObservation,
} from "@testing/harnesses/compact/compact";

describe("compact transcript extraction", () => {
  it("extracts the last active node from JSONL string fields with escaped transcript markers", () => {
    withEscapedTranscriptObservation(({ actual, expected }) => expect(actual).toEqual(expected));
  });

  it("extracts the last active node from JSONL string fields with unescaped transcript markers", () => {
    withUnescapedTranscriptObservation(({ actual, expected }) => expect(actual).toEqual(expected));
  });

  it("extracts the last active node from JSONL nested string-encoded transcript markers", () => {
    withNestedTranscriptObservation(({ actual, expected }) => expect(actual).toEqual(expected));
  });

  it("ignores marker text outside JSON string field values", () => {
    withNonStringMarkerObservation(({ actual }) => expect(actual).toBeUndefined());
  });

  it("returns no record when the foundation marker is absent", () => {
    withMissingFoundationObservation(({ actual }) => expect(actual).toBeUndefined());
  });

  it("stores compact state under the local worktree session scope", async () => {
    await withCompactPathObservation(({ actual, expected }) => {
      expect(actual.ok).toBe(true);
      if (actual.ok) expect(actual.value).toBe(expected);
    });
  });
});
