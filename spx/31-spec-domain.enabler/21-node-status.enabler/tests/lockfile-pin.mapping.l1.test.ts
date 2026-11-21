import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CURRENCY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  withoutLockfile,
} from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { lockfileNameDomain, lockfilePinCases, pinHoldsLockfile } from "@testing/generators/node-status/lockfile-pin";
import { withLockfilePinRepository } from "@testing/harnesses/node-status/lockfile-pin";

describe("the pin of a result holds the lockfile exactly when the result is Deterministic or Attested", () => {
  it.each(lockfilePinCases())(
    "maps a $section entry of a $mode result that read $lockfileName to its pin and to its currency after a lockfile-only commit",
    async ({ lockfileName, section, mode }) => {
      await withLockfilePinRepository(lockfileName, async (repository) => {
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
  it.each(lockfileNameDomain())(
    "projects the evidence entry current, with a pin that names no lockfile, from a run that judged %s recorded before that commit",
    async (lockfileName) => {
      await withLockfilePinRepository(lockfileName, async (repository) => {
        await repository.projectAfterLockfileOnlyChange();

        const evidence = await repository.reportedResult(NODE_STATUS_CLAIM_SECTION.EVIDENCE);
        expect(evidence?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
        expect(evidence?.read?.includes(repository.lockfilePath)).toBe(false);
        expect(evidence?.currency).toBe(NODE_STATUS_CURRENCY.CURRENT);
      });
    },
  );
});

describe("the strip of an Agentic pin removes every lockfile name a registered testing language declares", () => {
  it.each(
    testingRegistry.languages.flatMap((language) =>
      language.lockfileNames.map((lockfileName) => ({ language: language.name, lockfileName }))
    ),
  )(
    "removes $lockfileName, declared by the $language language, from a read set",
    ({ lockfileName }) => {
      expect(withoutLockfile([lockfileName])).toEqual([]);
    },
  );
});
