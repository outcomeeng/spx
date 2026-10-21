import { describe, expect, it } from "vitest";

import { SPEC_TREE_EVIDENCE_KEY_KIND, SPEC_TREE_VERIFICATION_TYPE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryBracketedProseScenario,
  arbitraryDuplicateAuditSlugScenario,
  arbitraryRepeatedSlugAcrossSpecsScenario,
  arbitraryTwoTagLineScenario,
  arbitraryUnkeyedAuditScenario,
} from "@testing/generators/spec-tree/evidence-references";
import { readEvidenceSpecsFromFilesystem } from "@testing/harnesses/spec-tree/evidence-references";

describe("unkeyed audit references", () => {
  it("reads a pathless audit tag and a legacy review tag as unkeyed audit references", async () => {
    const scenario = sampleGeneratedValue(arbitraryUnkeyedAuditScenario());

    const snapshot = await readEvidenceSpecsFromFilesystem([scenario]);

    const references = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences ?? [];
    expect(references).toEqual(scenario.expected);
    expect(references.length).toBeGreaterThan(1);
    for (const reference of references) {
      expect(reference).toEqual({
        verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED },
      });
    }
  });
});

describe("tag position", () => {
  it("reads bracketed audit and review words in prose as no reference, leaving only the tags at the line ends", async () => {
    const scenario = sampleGeneratedValue(arbitraryBracketedProseScenario());

    const snapshot = await readEvidenceSpecsFromFilesystem([scenario]);

    const references = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences ?? [];
    expect(references).toEqual(scenario.expected);
  });
});

describe("one evidence tag per assertion line", () => {
  it("keeps the first tag of an assertion line carrying two real evidence tags and reads successfully", async () => {
    const scenario = sampleGeneratedValue(arbitraryTwoTagLineScenario());

    const snapshot = await readEvidenceSpecsFromFilesystem([scenario]);

    const references = snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences ?? [];
    expect(references).toEqual(scenario.expected);
  });
});

describe("audit rule slug uniqueness", () => {
  it("fails the read naming the spec and the slug when one spec holds two audit tags with one slug", async () => {
    const scenario = sampleGeneratedValue(arbitraryDuplicateAuditSlugScenario());

    const outcome = await readEvidenceSpecsFromFilesystem([scenario]).then(
      (snapshot) => snapshot,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain(scenario.specPath);
    expect((outcome as Error).message).toContain(scenario.slug);
  });

  it("reads successfully when the same slug appears in different specs, each holding it once", async () => {
    const scenario = sampleGeneratedValue(arbitraryRepeatedSlugAcrossSpecsScenario());

    const snapshot = await readEvidenceSpecsFromFilesystem(scenario.specs);

    expect(
      scenario.specs.map(({ entry }) =>
        snapshot.allNodes
          .find(({ slug }) => slug === entry.slug)
          ?.evidenceReferences.filter(({ key }) =>
            key.kind === SPEC_TREE_EVIDENCE_KEY_KIND.SLUG && key.slug === scenario.slug
          ).length
      ),
    ).toEqual(scenario.specs.map(() => 1));
  });
});
