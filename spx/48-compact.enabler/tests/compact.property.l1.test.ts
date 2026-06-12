/**
 * Compact domain invariants — last-occurrence extraction, contiguous stash
 * numbering, and serialization round-trips over generated inputs (L1).
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
import { arbitraryFoundationTranscript, arbitraryNodePath } from "@testing/generators/compact/compact";

describe("compact stash extraction properties", () => {
  it("active_node is the last context marker in any foundation-bearing transcript", () => {
    fc.assert(
      fc.property(arbitraryFoundationTranscript(), ({ contextNodes, body }) => {
        const record = extractStashRecord(body);
        expect(record).not.toBeNull();
        expect(record?.active_node).toBe(contextNodes[contextNodes.length - 1]);
        expect(record?.has_foundation).toBe(true);
      }),
    );
  });
});

describe("compact stash numbering properties", () => {
  it("yields a contiguous sequence with no gaps and no overwrite", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (count) => {
        const filenames: string[] = [];
        for (let written = 0; written < count; written += 1) {
          const index = nextStashIndex(filenames);
          expect(index).toBe(written + 1);
          expect(filenames).not.toContain(stashRecordFilename(index));
          filenames.push(stashRecordFilename(index));
        }
        expect(filenames.length).toBe(count);
      }),
    );
  });

  it("round-trips any filename index", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (index) => {
        expect(parseStashFilenameIndex(stashRecordFilename(index))).toBe(index);
      }),
    );
  });
});

describe("compact stash record serialization properties", () => {
  it("round-trips any record through serialize and parse", () => {
    fc.assert(
      fc.property(arbitraryNodePath(), (node) => {
        const record = { active_node: node, has_foundation: true } as const;
        expect(parseStashRecord(serializeStashRecord(record))).toEqual(record);
      }),
    );
  });
});
