import { describe, expect, it } from "vitest";

import { acceptsKnowledgeRoot, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { KNOWLEDGE_BUNDLE_GENERATOR } from "@testing/generators/spec-tree/lane-directories";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

const [FOUR_ZERO_VERSION] = recognitionOptionsForLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO).selectedVersions;

describe("the knowledge root of the 4.0 naming-schema version", () => {
  it("accepts every path beneath the knowledge directory, leaving its structure to the bundle's author", () => {
    assertProperty(
      KNOWLEDGE_BUNDLE_GENERATOR.entry(),
      ({ pathFromNode, entryKind }) => {
        expect({ pathFromNode, accepted: acceptsKnowledgeRoot(FOUR_ZERO_VERSION, pathFromNode, entryKind) }).toEqual({
          pathFromNode,
          accepted: true,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
