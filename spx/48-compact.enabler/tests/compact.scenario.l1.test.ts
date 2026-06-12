/**
 * Compact domain — example-based extraction, serialization, and stash-numbering
 * behavior. Pure computation over generated transcripts and node paths (L1).
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  extractStashRecord,
  nextStashIndex,
  parseStashFilenameIndex,
  parseStashRecord,
  serializeStashRecord,
  stashRecordFilename,
} from "@/domains/compact";
import { arbitraryNodePath, renderTranscript, sampleCompactTestValue } from "@testing/generators/compact/compact";

describe("compact stash extraction", () => {
  it("extracts the last context node and foundation flag from a foundation-bearing transcript", () => {
    const nodes = sampleCompactTestValue(fc.array(arbitraryNodePath(), { minLength: 2, maxLength: 4 }));
    const body = renderTranscript({ hasFoundation: true, contextNodes: nodes, escaped: false });

    expect(extractStashRecord(body)).toEqual({ active_node: nodes[nodes.length - 1], has_foundation: true });
  });

  it("tolerates JSON-string-escaped context markers", () => {
    const node = sampleCompactTestValue(arbitraryNodePath());
    const body = renderTranscript({ hasFoundation: true, contextNodes: [node], escaped: true });

    expect(extractStashRecord(body)?.active_node).toBe(node);
  });

  it("records an empty active node when a foundation marker appears with no context marker", () => {
    const body = renderTranscript({ hasFoundation: true, contextNodes: [], escaped: false });

    expect(extractStashRecord(body)).toEqual({ active_node: "", has_foundation: true });
  });

  it("returns null when the transcript carries no foundation marker", () => {
    const nodes = sampleCompactTestValue(fc.array(arbitraryNodePath(), { minLength: 1, maxLength: 3 }));
    const body = renderTranscript({ hasFoundation: false, contextNodes: nodes, escaped: false });

    expect(extractStashRecord(body)).toBeNull();
  });
});

describe("compact stash record serialization", () => {
  it("serializes a record whose JSON carries exactly the record's own fields", () => {
    const node = sampleCompactTestValue(arbitraryNodePath());
    const record = { active_node: node, has_foundation: true } as const;

    const parsed: Record<string, unknown> = JSON.parse(serializeStashRecord(record));

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(record).sort());
    expect(parseStashRecord(serializeStashRecord(record))).toEqual(record);
  });
});

describe("compact stash numbering", () => {
  it("round-trips a filename through its index", () => {
    const index = sampleCompactTestValue(fc.integer({ min: 1, max: 99 }));

    expect(parseStashFilenameIndex(stashRecordFilename(index))).toBe(index);
  });

  it("returns the first index for an empty directory and one past the maximum otherwise", () => {
    const indices = sampleCompactTestValue(
      fc.uniqueArray(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 6 }),
    );
    const filenames = indices.map(stashRecordFilename);

    expect(nextStashIndex([])).toBe(1);
    expect(nextStashIndex(filenames)).toBe(Math.max(...indices) + 1);
  });
});
