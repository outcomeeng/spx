import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveTargetedTestFiles } from "@/domains/testing";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

// A node path paired with one own test file under it, so a list of these yields a
// discovered set whose every entry is reachable by its node operand.
function arbitraryNodeWithOwnFile(): fc.Arbitrary<{ readonly node: string; readonly file: string }> {
  return TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((file) => ({ node, file }))
  );
}

// A parent node, a descendant under it, and one own test file in each. A recursive
// parent operand and the descendant operand both match the descendant file, which
// makes their resolutions overlap on a genuinely distinct discovered candidate.
function arbitraryNestedFiles(): fc.Arbitrary<{
  readonly parent: string;
  readonly descendant: string;
  readonly ownFile: string;
  readonly descendantFile: string;
}> {
  return TEST_DISPATCH_GENERATOR.nodeWithDescendant().chain(([parent, descendant]) =>
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parent).chain((ownFile) =>
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendant).map((descendantFile) => ({
        parent,
        descendant,
        ownFile,
        descendantFile,
      }))
    )
  );
}

describe("targeted execution resolution invariants", () => {
  it("selects the order- and repetition-independent union of operand resolutions", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbitraryNodeWithOwnFile(), {
          minLength: 1,
          maxLength: 4,
          selector: (entry) => entry.node,
        }),
        (entries) => {
          const discovered = entries.map((entry) => entry.file);
          const operands = entries.map((entry) => nodeOperand(entry.node));

          const base = resolveTargetedTestFiles(discovered, { operands, recursive: false }).selected;
          const reversed = resolveTargetedTestFiles(discovered, {
            operands: [...operands].reverse(),
            recursive: false,
          }).selected;
          const duplicated = resolveTargetedTestFiles(discovered, {
            operands: [...operands, ...operands],
            recursive: false,
          }).selected;

          // Order and repetition of operands never change the selected set.
          expect([...reversed]).toEqual([...base]);
          expect([...duplicated]).toEqual([...base]);
          // The selected set carries no duplicates and covers every operand's own file.
          expect(new Set(base).size).toBe(base.length);
          for (const entry of entries) {
            expect(base).toContain(entry.file);
          }
        },
      ),
    );
  });

  it("deduplicates a file matched by more than one distinct operand", () => {
    fc.assert(
      fc.property(arbitraryNestedFiles(), ({ parent, descendant, ownFile, descendantFile }) => {
        // The recursive parent operand matches the whole subtree (own + descendant
        // file); the descendant operand matches the descendant file too. Their union
        // keeps the overlapping file exactly once.
        const selected = resolveTargetedTestFiles([ownFile, descendantFile], {
          operands: [nodeOperand(parent), nodeOperand(descendant)],
          recursive: true,
        }).selected;

        expect(descendantFile).not.toBe(ownFile);
        expect(selected.filter((file) => file === descendantFile)).toHaveLength(1);
        expect(new Set(selected).size).toBe(selected.length);
        expect(selected).toContain(ownFile);
      }),
    );
  });
});
