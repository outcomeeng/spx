import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryMigrationClassificationCase,
  arbitraryMigrationTreeLayout,
  MIGRATING_DECLARATION,
} from "@testing/generators/spec-tree/migration-classification";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withMigrationTreeEnv } from "@testing/harnesses/spec-tree/migration-classification";

describe("migration classification compliance", () => {
  it("classifies a source-version and a target-version node directory valid and a directory of neither invalid", () => {
    assertProperty(
      arbitraryMigrationClassificationCase(),
      ({ options, sourceDirectory, targetDirectory, neitherDirectory }) => {
        const classify = (relativePath: string) =>
          recognizeSpecTreeFilesystemEntry(
            { type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY, relativePath },
            options,
          );

        expect(classify(sourceDirectory)?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        expect(classify(targetDirectory)?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        expect(classify(neitherDirectory)?.type).toBe(SPEC_TREE_ENTRY_TYPE.INVALID);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("traverses source-version and target-version directories with their descendants and leaves a directory of neither residual", async () => {
    const layout = sampleGeneratedValue(arbitraryMigrationTreeLayout());

    await withMigrationTreeEnv(MIGRATING_DECLARATION, layout, async (env) => {
      const snapshot = await env.read();
      const expectedIds = [layout.sourceParent, layout.targetChild, layout.targetParent, layout.sourceChild];

      expect(snapshot.allNodes).toHaveLength(expectedIds.length);
      expect(snapshot.allNodes.map(({ id }) => id)).toEqual(expect.arrayContaining(expectedIds));
      expect(snapshot.allNodes.find(({ id }) => id === layout.targetChild)?.parentId).toBe(layout.sourceParent);
      expect(snapshot.allNodes.find(({ id }) => id === layout.sourceChild)?.parentId).toBe(layout.targetParent);
      expect(snapshot.residual.map(({ id }) => id)).toEqual([layout.neither]);
    });
  });
});
