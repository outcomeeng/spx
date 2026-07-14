import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import {
  sampleDecisionKind,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec-tree entry recognition", () => {
  it("maps registered node suffixes to node source entries", () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
      relativePath: `${order}-${slug}${KIND_REGISTRY[nodeKind].suffix}`,
    });

    const nodeEntry = expectPresent(entry);

    expect(nodeEntry.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    if (nodeEntry.type !== SPEC_TREE_ENTRY_TYPE.NODE) {
      // TypeScript narrowing; the expect above throws first when the type differs.
      throw new Error("Expected recognized filesystem entry to be a node");
    }
    expect(nodeEntry.kind).toBe(nodeKind);
    expect(nodeEntry.order).toBe(order);
    expect(nodeEntry.slug).toBe(slug);
  });

  it("maps registered decision suffixes to decision source entries", () => {
    const decisionKind = sampleDecisionKind(KIND_REGISTRY);
    const parentOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const decisionOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const parentSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const decisionSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const parentId = `${parentOrder}-${parentSlug}${KIND_REGISTRY[sampleNodeKind(KIND_REGISTRY)].suffix}`;
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${parentId}/${decisionOrder}-${decisionSlug}${KIND_REGISTRY[decisionKind].suffix}`,
      parentId,
    });

    const decisionEntry = expectPresent(entry);

    expect(decisionEntry.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
    if (decisionEntry.type !== SPEC_TREE_ENTRY_TYPE.DECISION) {
      // TypeScript narrowing; the expect above throws first when the type differs.
      throw new Error("Expected recognized filesystem entry to be a decision");
    }
    expect(decisionEntry.kind).toBe(decisionKind);
    expect(decisionEntry.order).toBe(decisionOrder);
    expect(decisionEntry.slug).toBe(decisionSlug);
    expect(decisionEntry.parentId).toBe(parentId);
  });

  it("maps product filenames to product source entries", () => {
    const productSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const entry = recognizeSpecTreeFilesystemEntry({
      type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: `${productSlug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
    });

    expect(entry).toEqual({
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: `${productSlug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
      title: productSlug,
      ref: {
        id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${productSlug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
        path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${productSlug}${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`,
      },
    });
  });

  it("classifies an ordered name with an unregistered suffix as an invalid entry", () => {
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const suffix = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY));

    const entry = expectPresent(
      recognizeSpecTreeFilesystemEntry({
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
        relativePath: `${order}-${slug}${suffix}`,
      }),
    );

    expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
  });
});
