import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_SECTION, NODE_STATUS_CURRENCY, NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { lockfilePinCases, pinHoldsLockfile } from "@testing/generators/node-status/lockfile-pin";
import { withLockfilePinRepository } from "@testing/harnesses/node-status/lockfile-pin";

describe("the pin of a result holds the lockfile exactly when the result is Deterministic or Attested", () => {
  it.each(lockfilePinCases())(
    "maps a $section entry of a $mode result to its pin and to its currency after a lockfile-only commit",
    async ({ section, mode }) => {
      await withLockfilePinRepository(async (repository) => {
        await repository.projectAndCommit();
        const written = await repository.reportedResult(section);
        expect(written?.read?.includes(repository.lockfilePath)).toBe(pinHoldsLockfile(mode));

        await repository.commitLockfileOnlyChange();

        const afterLockfileCommit = await repository.reportedResult(section);
        expect(afterLockfileCommit?.currency).toBe(
          pinHoldsLockfile(mode) ? NODE_STATUS_CURRENCY.NOT_CURRENT : NODE_STATUS_CURRENCY.CURRENT,
        );
      });
    },
  );
});

describe("a sealed audit run that judged the lockfile backs an evidence entry across a lockfile-only commit", () => {
  it("projects the evidence entry current, with a pin that names no lockfile, from a run recorded before that commit", async () => {
    await withLockfilePinRepository(async (repository) => {
      await repository.projectAfterLockfileOnlyChange();

      const evidence = await repository.reportedResult(NODE_STATUS_CLAIM_SECTION.EVIDENCE);
      expect(evidence?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      expect(evidence?.read?.includes(repository.lockfilePath)).toBe(false);
      expect(evidence?.currency).toBe(NODE_STATUS_CURRENCY.CURRENT);
    });
  });
});
