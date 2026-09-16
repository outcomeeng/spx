import { describe, expect, it } from "vitest";

import { resolveTargetedTestFiles } from "@/lib/test-targeting";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { nodeOperand, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("targeted execution resolution invariants", () => {
  it("selects the order- and repetition-independent union of operand resolutions", () => {
    assertProperty(
      TEST_DISPATCH_GENERATOR.distinctNodesWithOwnFiles(typescriptTestingLanguage),
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
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("deduplicates a file matched by more than one distinct operand", () => {
    assertProperty(
      TEST_DISPATCH_GENERATOR.nestedFiles(typescriptTestingLanguage),
      ({ parent, descendant, ownFile, descendantFile }) => {
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
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
