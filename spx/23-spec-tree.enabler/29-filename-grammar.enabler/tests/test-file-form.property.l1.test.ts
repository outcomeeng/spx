import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { TEST_FILE_FORM_GENERATOR } from "@testing/generators/spec-tree/test-file-form";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("the test-file form of the 4.0 and the 3.x naming-schema versions", () => {
  it("accepts every name that composes the stated form under a node's tests directory", () => {
    assertProperty(
      TEST_FILE_FORM_GENERATOR.accepted(),
      ({ line, parentId, relativePath }) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath, parentId },
          recognitionOptionsForLine(line),
        );

        expect({ relativePath, type: entry?.type }).toEqual({ relativePath, type: SPEC_TREE_ENTRY_TYPE.EVIDENCE });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("accepts a name exactly when it has the stated form and rejects every other name", () => {
    assertProperty(
      TEST_FILE_FORM_GENERATOR.candidate(),
      ({ line, parentId, relativePath, accepted }) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE, relativePath, parentId },
          recognitionOptionsForLine(line),
        );

        expect({ relativePath, accepted: entry?.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE }).toEqual({
          relativePath,
          accepted,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
