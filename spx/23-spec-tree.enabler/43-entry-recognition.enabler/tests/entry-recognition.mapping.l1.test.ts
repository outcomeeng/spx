import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import {
  decisionFileRecognitionCases,
  nodeDirectoryRecognitionCases,
  productRootRecognitionCases,
  segmentOrderRecognitionCases,
} from "@testing/generators/spec-tree/filename-grammar";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

/** Orders two segment lists numerically segment by segment; a list that extends another follows it. */
function compareSegments(left: readonly number[], right: readonly number[]): number {
  const shared = Math.min(left.length, right.length);
  for (let position = 0; position < shared; position += 1) {
    const difference = Math.sign((left[position] ?? 0) - (right[position] ?? 0));
    if (difference !== 0) return difference;
  }
  return Math.sign(left.length - right.length);
}

function indexSegments(indexText: string): readonly number[] {
  return indexText.split(SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR).map((segment) => Number.parseInt(segment, 10));
}

describe("spec-tree entry recognition", () => {
  it.each(nodeDirectoryRecognitionCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(
      { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath: testCase.relativePath },
      recognitionOptionsForLine(testCase.line),
    );

    expect(entry).toMatchObject({
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      kind: testCase.kind,
      orderSegments: testCase.orderSegments,
      slug: testCase.slug,
    });
  });

  it.each(decisionFileRecognitionCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(
      {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: testCase.relativePath,
        parentId: testCase.parentId,
      },
      recognitionOptionsForLine(testCase.line),
    );

    expect(entry).toMatchObject({
      type: SPEC_TREE_ENTRY_TYPE.DECISION,
      kind: testCase.kind,
      orderSegments: testCase.orderSegments,
      slug: testCase.slug,
      parentId: testCase.parentId,
    });
  });

  it.each(productRootRecognitionCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(
      {
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: testCase.relativePath,
        declaredKind: testCase.declaredKind,
      },
      recognitionOptionsForLine(testCase.line),
    );

    expect(entry).toMatchObject({ type: SPEC_TREE_ENTRY_TYPE.PRODUCT, title: testCase.slug });
  });
});

describe("spec-tree entry recognition order", () => {
  it.each(segmentOrderRecognitionCases())(
    "maps $title to entries ordered segment by segment",
    (testCase) => {
      const options = recognitionOptionsForLine(testCase.line);
      const lower = recognizeSpecTreeFilesystemEntry(testCase.lower, options);
      const higher = recognizeSpecTreeFilesystemEntry(testCase.higher, options);

      expect(lower).not.toBeNull();
      expect(higher).not.toBeNull();
      if (
        (lower?.type !== SPEC_TREE_ENTRY_TYPE.NODE && lower?.type !== SPEC_TREE_ENTRY_TYPE.DECISION)
        || (higher?.type !== SPEC_TREE_ENTRY_TYPE.NODE && higher?.type !== SPEC_TREE_ENTRY_TYPE.DECISION)
      ) {
        throw new Error("Expected recognized node or decision entries");
      }

      const expectedRelation = compareSegments(
        indexSegments(testCase.lowerIndex),
        indexSegments(testCase.higherIndex),
      );
      expect(expectedRelation).toBeLessThan(0);
      expect(lower.orderSegments).toEqual(indexSegments(testCase.lowerIndex));
      expect(higher.orderSegments).toEqual(indexSegments(testCase.higherIndex));

      const observedRelation = compareSegments(lower.orderSegments ?? [], higher.orderSegments ?? []);
      expect(observedRelation).toBe(expectedRelation);
      expect(observedRelation).not.toBe(0);
    },
  );
});
