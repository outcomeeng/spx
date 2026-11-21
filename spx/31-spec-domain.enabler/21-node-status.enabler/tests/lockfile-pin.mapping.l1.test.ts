import { describe, expect, it } from "vitest";

import { NODE_STATUS_CURRENCY } from "@/lib/node-status";
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
