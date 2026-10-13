import { describe, expect, it } from "vitest";

import { createFilesystemSpecTreeSource, readSpecTree } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { newestSupersededVersionCases } from "@testing/generators/spec-tree/naming-schema-version";
import {
  orderedDirectoryName,
  SPEC_TREE_CASE_TITLE,
  specTreeConfigForLine,
  supersededNodeSuffixCases,
} from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

describe("residual retention", () => {
  it.each(supersededNodeSuffixCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    const supersededDirectory = orderedDirectoryName(testCase.suffix);
    await withSpecTreeEnv(specTreeConfigForLine(testCase.line), async (env) => {
      await writeOrderedDirectory(env, supersededDirectory);
      const snapshot = await readSpecTree({ source: env.filesystemSource() });
      expect(snapshot.superseded.map((entry) => entry.id)).toEqual([supersededDirectory]);
      expect(snapshot.superseded[0]?.version).toBe(testCase.version);
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(supersededDirectory);
    });
  });

  it.each(newestSupersededVersionCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    const supersededDirectory = orderedDirectoryName(testCase.suffix);
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await writeOrderedDirectory(env, supersededDirectory);
      const snapshot = await readSpecTree({
        source: createFilesystemSpecTreeSource({
          productDir: env.productDir,
          selection: { known: testCase.schemaVersions, selected: testCase.selectedVersions },
        }),
      });
      expect(snapshot.superseded.map((entry) => entry.id)).toEqual([supersededDirectory]);
      expect(snapshot.superseded[0]?.version).toBe(testCase.expectedVersion);
      expect(snapshot.allNodes.map((node) => node.id)).not.toContain(supersededDirectory);
    });
  });
});
