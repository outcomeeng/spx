import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_FIELD, NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import {
  arbitraryAttributionTree,
  ATTRIBUTION_ROLE,
  ATTRIBUTION_ROLES_OUTSIDE_IN,
  ATTRIBUTION_SUBJECT_KIND,
  attributionSubjectCases,
  nearestNodePath,
} from "@testing/generators/node-status/evidence-attribution";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withAttributionTree } from "@testing/harnesses/node-status/evidence-attribution";

describe("a sealed audit unit backs an evidence entry only of the Node nearest its subject", () => {
  it.each(attributionSubjectCases())(
    "maps a $kind subject held by the $holder to the one Node nearest it",
    async ({ kind, holder }) => {
      await withAttributionTree(sampleGeneratedValue(arbitraryAttributionTree()), async (tree) => {
        const subject = tree.subjectOf(kind, holder);
        const recorded = await tree.recordAuditRun(subject);

        await tree.update();

        const nearest = nearestNodePath(subject, Object.values(tree.nodePaths));
        const yielding = ATTRIBUTION_ROLES_OUTSIDE_IN.filter((role) =>
          tree.writtenEvidenceEntry(role)?.[NODE_STATUS_CLAIM_FIELD.RUN] === recorded.run
        );
        expect(yielding.map((role) => tree.nodePaths[role])).toEqual(nearest === undefined ? [] : [nearest]);
        for (const role of ATTRIBUTION_ROLES_OUTSIDE_IN.filter((candidate) => !yielding.includes(candidate))) {
          const entry = tree.writtenEvidenceEntry(role);
          expect(entry?.[NODE_STATUS_CLAIM_FIELD.VERDICT], role).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
          expect(entry?.[NODE_STATUS_CLAIM_FIELD.COMMIT], role).toBeUndefined();
          expect(entry?.[NODE_STATUS_CLAIM_FIELD.READ], role).toBeUndefined();
        }
      });
    },
  );

  it("maps a committed evidence entry whose run holds only a child Node's unit to not-run with no pin", async () => {
    await withAttributionTree(sampleGeneratedValue(arbitraryAttributionTree()), async (tree) => {
      const subject = tree.subjectOf(ATTRIBUTION_SUBJECT_KIND.TESTS_FILE, ATTRIBUTION_ROLE.CHILD);
      const recorded = await tree.recordAuditRun(subject);
      await tree.commitEvidenceEntry(ATTRIBUTION_ROLE.PARENT, recorded);

      await tree.update();

      expect(nearestNodePath(subject, Object.values(tree.nodePaths))).toBe(tree.nodePaths[ATTRIBUTION_ROLE.CHILD]);
      const entry = tree.writtenEvidenceEntry(ATTRIBUTION_ROLE.PARENT);
      expect(entry?.[NODE_STATUS_CLAIM_FIELD.VERDICT]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      expect(entry?.[NODE_STATUS_CLAIM_FIELD.COMMIT]).toBeUndefined();
      expect(entry?.[NODE_STATUS_CLAIM_FIELD.READ]).toBeUndefined();
      expect(entry?.[NODE_STATUS_CLAIM_FIELD.RUN]).toBeUndefined();
    });
  });
});
