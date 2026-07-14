import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

const propertyRunCount = SPEC_TREE_TEST_GENERATOR.counts.assemblyPropertyRunCount;

describe("evidence recognition", () => {
  it("maps a canonical evidence-form filename under a tests directory to an evidence entry", () => {
    fc.assert(
      fc.property(
        SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
        SPEC_TREE_TEST_GENERATOR.sourceSlug(),
        SPEC_TREE_TEST_GENERATOR.evidenceFileName(),
        (order, slug, evidenceFileName) => {
          const parentId = `${order}-${slug}${KIND_REGISTRY.enabler.suffix}`;
          const relativePath = [parentId, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFileName].join(
            SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
          );
          const entry = expectPresent(
            recognizeSpecTreeFilesystemEntry({
              type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
              relativePath,
              parentId,
            }),
          );
          expect(entry.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
          if (entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE) {
            expect(entry.parentId).toBe(parentId);
          }
        },
      ),
      { numRuns: propertyRunCount },
    );
  });
});
