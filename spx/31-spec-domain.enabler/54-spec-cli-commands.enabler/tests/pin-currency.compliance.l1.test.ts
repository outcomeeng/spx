import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { NODE_STATUS_CLAIM_SECTION, NODE_STATUS_CURRENCY } from "@/lib/node-status";
import { testingRunsDir } from "@/test/run-state";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  currentMethodologyConfig,
  type PinnedNodeRepository,
  readNodeStatusFileBytes,
  readSpecTreeWorkingChanges,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import { readStatusJsonNode } from "@testing/harnesses/spec-tree/spec-cli-commands";

describe("spec status pin currency reporting", () => {
  it("ALWAYS: reporting pin currency executes no verification and writes nothing", async () => {
    // Each case is a checkout state the pin-currency rule distinguishes: a pin
    // over an unchanged read set, and pins whose read set holds a changed
    // subject or a changed spec. The changed read sets are the violating
    // inputs: reporting them leaves real currency work to do, and the
    // tempting responses are to re-run the test or to refresh the claim.
    const cases: readonly {
      readonly edit: (repository: PinnedNodeRepository, editedSubject: number) => Promise<void>;
      readonly currency: string;
    }[] = [
      { edit: () => Promise.resolve(), currency: NODE_STATUS_CURRENCY.CURRENT },
      {
        edit: (repository, editedSubject) => repository.editSubject(editedSubject),
        currency: NODE_STATUS_CURRENCY.NOT_CURRENT,
      },
      { edit: (repository) => repository.editSpecText(), currency: NODE_STATUS_CURRENCY.NOT_CURRENT },
    ];
    for (const { edit, currency } of cases) {
      const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
      await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
        const productDir = repository.env.productDir;
        await repository.writeClaim({
          [NODE_STATUS_CLAIM_SECTION.TEST]: {
            [repository.testKeys[0] ?? ""]: repository.passedEntry([
              repository.specPath,
              repository.testPaths[0] ?? "",
              repository.subjectPaths[fixture.editedSubject] ?? "",
            ]),
          },
        });
        await repository.commitAll();
        await edit(repository, fixture.editedSubject);
        const claimsBefore = await readNodeStatusFileBytes(productDir);
        const changesBefore = await readSpecTreeWorkingChanges(productDir);

        const node = await readStatusJsonNode(productDir, repository.nodeId, repository.git);

        // The report reached the recorded pin, so the no-op observations below
        // judge a report that performed real currency work.
        expect(node?.claim?.results.map((result) => result.currency), currency).toEqual([currency]);
        expect(existsSync(testingRunsDir(productDir)), currency).toBe(false);
        expect(await readNodeStatusFileBytes(productDir), currency).toEqual(claimsBefore);
        expect(await readSpecTreeWorkingChanges(productDir), currency).toEqual(changesBefore);
      });
    }
  });
});
