import { describe, expect, it } from "vitest";

import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryCoveringEvidenceReferenceScenario } from "@testing/generators/spec-tree/evidence-references";
import { readEvidenceSpecsWithoutReadText } from "@testing/harnesses/spec-tree/evidence-references";

describe("evidence references of a source without readText", () => {
  it("carries no evidence references on any node", async () => {
    const scenario = sampleGeneratedValue(arbitraryCoveringEvidenceReferenceScenario());

    const snapshot = await readEvidenceSpecsWithoutReadText([scenario]);

    const node = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug);
    expect(scenario.expected.length).toBeGreaterThan(0);
    expect(node?.evidenceReferences).toEqual([]);
    expect(snapshot.allNodes.map(({ evidenceReferences }) => evidenceReferences)).toEqual(
      snapshot.allNodes.map(() => []),
    );
  });
});
