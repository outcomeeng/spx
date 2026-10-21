import { describe, expect, it } from "vitest";

import { SPEC_TREE_EVIDENCE_KEY_KIND, SPEC_TREE_EVIDENCE_TARGET } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryLinkTargetScenario } from "@testing/generators/spec-tree/evidence-references";
import {
  readEvidenceSpecsFromFilesystem,
  readEvidenceSpecsWithUnreadableSpec,
  readEvidenceSpecsWithUnreadableTargets,
} from "@testing/harnesses/spec-tree/evidence-references";

describe("evidence link target resolution", () => {
  it("maps a link to a read target to a resolved reference and a link to an absent target to a dangling reference", async () => {
    const scenario = sampleGeneratedValue(arbitraryLinkTargetScenario());

    const snapshot = await readEvidenceSpecsFromFilesystem([scenario]);

    expect(snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences).toEqual(
      scenario.links.map(({ verificationType, path, present }) => ({
        verificationType,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path },
        target: present ? SPEC_TREE_EVIDENCE_TARGET.RESOLVED : SPEC_TREE_EVIDENCE_TARGET.DANGLING,
      })),
    );
  });

  it("keeps a read failure that is not a missing file as a read failure", async () => {
    const scenario = sampleGeneratedValue(arbitraryLinkTargetScenario());
    const presentLink = scenario.links.find(({ present }) => present);

    const outcome = await readEvidenceSpecsWithUnreadableTargets([scenario]).then(
      (snapshot) => snapshot,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain(presentLink?.path ?? "");
  });

  it("keeps a read failure on a node's own spec that is not a missing file as a read failure", async () => {
    const scenario = sampleGeneratedValue(arbitraryLinkTargetScenario());

    const outcome = await readEvidenceSpecsWithUnreadableSpec([scenario]).then(
      (snapshot) => snapshot,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain(scenario.specPath);
  });
});
