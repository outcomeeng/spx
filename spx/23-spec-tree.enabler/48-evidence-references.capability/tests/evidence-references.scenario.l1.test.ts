import { describe, expect, it } from "vitest";

import { SPEC_TREE_EVIDENCE_KEY_KIND, SPEC_TREE_EVIDENCE_TARGET, SPEC_TREE_VERIFICATION_TYPE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryCoveringEvidenceReferenceScenario } from "@testing/generators/spec-tree/evidence-references";
import {
  readEvidenceSpecsFromMemory,
  readEvidenceSpecsWithoutReadText,
} from "@testing/harnesses/spec-tree/evidence-references";

describe("evidence references of a node spec", () => {
  it("carries one reference per tagged assertion, keyed by the link path or the audit rule slug", async () => {
    const scenario = sampleGeneratedValue(arbitraryCoveringEvidenceReferenceScenario());

    const snapshot = await readEvidenceSpecsFromMemory([scenario]);

    const references = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences;
    expect(references).toEqual(scenario.expected);
    expect(new Set(references?.map(({ verificationType }) => verificationType))).toEqual(
      new Set(Object.values(SPEC_TREE_VERIFICATION_TYPE)),
    );
    for (const reference of references ?? []) {
      if (reference.verificationType === SPEC_TREE_VERIFICATION_TYPE.AUDIT) {
        expect(reference.key.kind).toBe(SPEC_TREE_EVIDENCE_KEY_KIND.SLUG);
      } else {
        expect(reference.key.kind).toBe(SPEC_TREE_EVIDENCE_KEY_KIND.PATH);
        expect(reference.target).toBe(SPEC_TREE_EVIDENCE_TARGET.RESOLVED);
      }
    }
  });
});

describe("evidence references of a source without readText", () => {
  it("carries no evidence references on any node", async () => {
    const scenario = sampleGeneratedValue(arbitraryCoveringEvidenceReferenceScenario());

    const snapshot = await readEvidenceSpecsWithoutReadText([scenario]);

    const node = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug);
    expect(scenario.expected.length).toBeGreaterThan(0);
    expect(node?.evidenceReferences).toEqual([]);
  });
});
