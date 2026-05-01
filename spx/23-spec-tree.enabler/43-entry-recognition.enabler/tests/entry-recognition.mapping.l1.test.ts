import { describe, expect, it } from "vitest";

import { recognizeSpecTreeFilesystemEntry, SPEC_TREE_ENTRY_TYPE, SPEC_TREE_FILESYSTEM_RECORD_TYPE } from "@/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/spec/config";
import {
  sampleDecisionKind,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree";

describe("spec-tree entry recognition", () => {
  it("maps registered node suffixes to node source entries", () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
      relativePath: `21-${slug}${KIND_REGISTRY[nodeKind].suffix}`,
    });

    expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    if (entry?.type === SPEC_TREE_ENTRY_TYPE.NODE) {
      expect(entry.kind).toBe(nodeKind);
      expect(entry.order).toBe(21);
      expect(entry.slug).toBe(slug);
    }
  });

  it("maps registered decision suffixes to decision source entries", () => {
    const decisionKind = sampleDecisionKind(KIND_REGISTRY);
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const decisionSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const parentId = `21-${parentSlug}${KIND_REGISTRY[sampleNodeKind(KIND_REGISTRY)].suffix}`;
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${parentId}/32-${decisionSlug}${KIND_REGISTRY[decisionKind].suffix}`,
      parentId,
    });

    expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
    if (entry?.type === SPEC_TREE_ENTRY_TYPE.DECISION) {
      expect(entry.kind).toBe(decisionKind);
      expect(entry.order).toBe(32);
      expect(entry.slug).toBe(decisionSlug);
      expect(entry.parentId).toBe(parentId);
    }
  });

  it("maps product filenames to product source entries", () => {
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `fixture${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
    });

    expect(entry).toEqual({
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: `fixture${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
      title: "fixture",
      ref: {
        id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/fixture${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
        path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/fixture${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
      },
    });
  });

  it("returns no entry for unregistered legacy suffixes", () => {
    const legacyPaths = [
      "21-legacy.capability",
      "32-legacy.feature",
      "43-legacy.story",
    ];

    for (const legacyPath of legacyPaths) {
      expect(
        recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: legacyPath,
        }),
      ).toBeNull();
    }
  });
});
